import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';

/**
 * Ensures consumer idempotency across worker restarts and duplicate message delivery.
 * Uses PostgreSQL `processed_events` table for persistence with in-memory caching fallback.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly memoryCache = new Set<string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Returns true if this eventId has already been processed by this consumerGroup.
   */
  async isProcessed(eventId: string, consumerGroup: string): Promise<boolean> {
    const memoryKey = `${consumerGroup}:${eventId}`;
    if (this.memoryCache.has(memoryKey)) return true;

    if (this.prisma) {
      try {
        const found = await this.prisma.processedEvent.findUnique({
          where: { eventId_consumerGroup: { eventId, consumerGroup } },
        });
        if (found) {
          this.memoryCache.add(memoryKey);
          return true;
        }
      } catch (error) {
        this.logger.warn(`Failed to check idempotency in DB; using in-memory cache: ${error}`);
      }
    }

    return false;
  }

  /**
   * Marks this eventId as processed by this consumerGroup.
   */
  async markProcessed(eventId: string, eventType: string, consumerGroup: string): Promise<void> {
    const memoryKey = `${consumerGroup}:${eventId}`;
    this.memoryCache.add(memoryKey);

    if (this.prisma) {
      try {
        await this.prisma.processedEvent.create({
          data: { eventId, eventType, consumerGroup },
        });
      } catch (error) {
        // Unique constraint violation means another instance just recorded it concurrently
        this.logger.debug(`Event ${eventId} already recorded in DB: ${error}`);
      }
    }
  }
}
