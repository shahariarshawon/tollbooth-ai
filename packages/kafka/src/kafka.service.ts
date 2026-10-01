import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import type { Consumer, Producer } from 'kafkajs';
import { errorMessage, withBoundedRetry } from './retry';

export interface KafkaModuleOptions {
  /** Identifies this app to the broker, in its logs and metrics (e.g. "tollbooth-gateway"). */
  clientId: string;
  brokers: string[];
  /** How many times a single message is retried before it is logged and skipped. Default 2. */
  maxMessageRetries?: number;
}

export const KAFKA_MODULE_OPTIONS = Symbol('KAFKA_MODULE_OPTIONS');

/**
 * A thin wrapper over kafkajs that both apps use the same way: the gateway only ever calls `publish`,
 * the worker only ever calls `subscribe`. Neither call can bring an app down or block a request/message
 * loop over a Kafka problem:
 *
 *  - The initial connection (`onModuleInit`) retries a bounded number of times (kafkajs's own `retry`
 *    option) and, if it still fails, is logged and left there: the app finishes starting regardless.
 *    `publish`/`subscribe` after that just no-op (logging each time) rather than retrying a connect on
 *    every call, which would otherwise add that same bounded delay to every single request.
 *  - Once connected, kafkajs reconnects a dropped connection by itself; nothing here needs to.
 *  - A single message's handler is retried a bounded number of times (`withBoundedRetry`) and then
 *    logged and skipped, so one bad or slow message does not wedge the consumer forever. There is no
 *    dead-letter queue yet: this is the event-driven foundation, not the final error-handling policy
 *    (see docs/architecture/kafka-events.md).
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Consumer[] = [];
  private readonly maxMessageRetries: number;
  private producerReady = false;

  constructor(@Inject(KAFKA_MODULE_OPTIONS) options: KafkaModuleOptions) {
    this.kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      // Bounded: a broker that is entirely absent (for example, in a test environment with no Kafka)
      // fails fast instead of retrying for minutes.
      retry: { retries: 3, initialRetryTime: 200, maxRetryTime: 2000 },
      // kafkajs logs very verbosely by default; this class does its own logging through Nest's Logger.
      logLevel: logLevel.NOTHING,
    });
    this.producer = this.kafka.producer();
    this.maxMessageRetries = options.maxMessageRetries ?? 2;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.producerReady = true;
      this.logger.log('Kafka producer connected');
    } catch (error) {
      this.logger.warn(
        `Kafka producer could not connect; events will be skipped until the app restarts with Kafka reachable: ${errorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const disconnects = this.consumers.map((consumer) => consumer.disconnect());
    if (this.producerReady) disconnects.push(this.producer.disconnect());
    await Promise.allSettled(disconnects);
  }

  /**
   * Publishes one event. Never throws and never blocks on a Kafka problem: a caller on the request path
   * should not await this before answering, and a caller that does await it only waits for a cheap,
   * already-caught no-op when the producer is not connected.
   *
   * Returns whether it actually sent, for tests and for anything that wants to know.
   */
  async publish<T extends object>(topic: string, payload: T, key?: string): Promise<boolean> {
    if (!this.producerReady) {
      this.logger.warn(`Skipped publishing to "${topic}": the producer is not connected`);
      return false;
    }
    try {
      await this.producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(payload) }],
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to publish to "${topic}": ${errorMessage(error)}`);
      return false;
    }
  }

  /**
   * Subscribes `onMessage` to every message on `topic`, in consumer group `groupId`. Connection failure
   * is logged, not thrown: the worker process stays up (so its health check still passes) even if Kafka
   * is not reachable yet, rather than crash-looping.
   */
  async subscribe<T>(
    topic: string,
    groupId: string,
    onMessage: (payload: T) => Promise<void>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    try {
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });
      this.consumers.push(consumer);

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            await withBoundedRetry(async () => {
              const payload = JSON.parse(message.value!.toString('utf8')) as T;
              await onMessage(payload);
            }, this.maxMessageRetries);
          } catch (error) {
            // Retries exhausted (or the message was not valid JSON, which no retry would fix): log and
            // move on, rather than leave the partition stuck behind one message forever.
            this.logger.error(`Giving up on a message from "${topic}": ${errorMessage(error)}`);
          }
        },
      });
      this.logger.log(`Kafka consumer subscribed to "${topic}" (group "${groupId}")`);
    } catch (error) {
      this.logger.warn(`Could not subscribe to "${topic}": ${errorMessage(error)}`);
    }
  }
}
