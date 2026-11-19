import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';
import { KafkaService } from '@tollbooth/kafka';

/**
 * Manages reliable publishing of outbox events to Kafka.
 *
 * Implements the Transactional Outbox pattern:
 * 1. Immediate dispatch: after the PostgreSQL transaction commits, attempts to publish
 *    the event immediately to Kafka. If Kafka is online, status becomes PUBLISHED.
 * 2. Background relay: if Kafka was unreachable during request time, events remain PENDING.
 *    The background poller continuously sweeps pending events and publishes them once Kafka recovers.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
  ) {}

  onModuleInit(): void {
    // Poll for pending outbox events every 5 seconds in background
    this.timer = setInterval(() => {
      void this.processPendingEvents().catch((err) => {
        this.logger.error(
          `Error in outbox relay: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, 5000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Attempts immediate dispatch right after the DB transaction commits.
   * Never throws and never blocks the client if Kafka is down.
   */
  async dispatchImmediately<T extends object>(
    outboxEventId: string,
    topic: string,
    payload: T,
    key?: string,
  ): Promise<boolean> {
    const published = await this.kafka.publish(topic, payload, key);
    if (published) {
      try {
        await this.prisma.outboxEvent.update({
          where: { id: outboxEventId },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(`Failed to mark outbox event ${outboxEventId} as published: ${error}`);
      }
      return true;
    }
    this.logger.warn(
      `Kafka publish failed for outbox event ${outboxEventId}; queued as PENDING for relay.`,
    );
    return false;
  }

  /**
   * Sweeps pending outbox events from the database and publishes them to Kafka.
   * Safe to call on demand or during test assertions.
   */
  async processPendingEvents(batchSize = 50): Promise<number> {
    let pending: Array<{ id: string; topic: string; eventKey: string | null; payload: unknown }>;
    try {
      pending = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
        select: { id: true, topic: true, eventKey: true, payload: true },
      });
    } catch {
      return 0;
    }

    if (pending.length === 0) return 0;

    let publishedCount = 0;
    for (const event of pending) {
      const payload = event.payload as object;
      const published = await this.kafka.publish(event.topic, payload, event.eventKey ?? undefined);
      if (published) {
        try {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PUBLISHED', publishedAt: new Date() },
          });
          publishedCount++;
        } catch (err) {
          this.logger.warn(
            `Failed to update published status for outbox event ${event.id}: ${err}`,
          );
        }
      } else {
        try {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              retryCount: { increment: 1 },
              lastError: 'Kafka producer unreachable or send failed',
            },
          });
        } catch {
          // Ignore transient update failure
        }
      }
    }

    return publishedCount;
  }
}
