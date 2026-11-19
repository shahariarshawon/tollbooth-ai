import {
  KAFKA_PROVIDER_GROUP,
  KAFKA_PROVIDER_TOPIC,
  KAFKA_USAGE_GROUP,
  KAFKA_USAGE_TOPIC,
} from '@tollbooth/kafka';
import type { KafkaService, ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';
import { IdempotencyService } from './idempotency.service';
import { UsageWorker } from './usage.worker';

function build() {
  const kafka = {
    subscribe: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<KafkaService>;
  const idempotency = new IdempotencyService();
  return { worker: new UsageWorker(kafka, idempotency), kafka, idempotency };
}

describe('UsageWorker', () => {
  describe('onModuleInit', () => {
    it('subscribes to usage.completed and provider.failed with DLQ options', async () => {
      const { worker, kafka } = build();

      await worker.onModuleInit();

      expect(kafka.subscribe).toHaveBeenCalledWith(
        KAFKA_USAGE_TOPIC,
        KAFKA_USAGE_GROUP,
        expect.any(Function),
        expect.any(Object),
      );
      expect(kafka.subscribe).toHaveBeenCalledWith(
        KAFKA_PROVIDER_TOPIC,
        KAFKA_PROVIDER_GROUP,
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe('onUsageCompleted', () => {
    const validEvent: UsageCompletedEvent = {
      requestId: 'req-1',
      tenantId: '123',
      projectId: 'proj-1',
      provider: 'GOOGLE',
      model: 'gemini-2.0-flash',
      requestTokens: 11,
      responseTokens: 7,
      totalTokens: 18,
      estimatedCost: '0.00000500',
      latencyMs: 120,
      timestamp: new Date().toISOString(),
    };

    it('logs and processes the event without throwing', async () => {
      const { worker } = build();
      await expect(worker.onUsageCompleted(validEvent)).resolves.toBeUndefined();
    });

    it('enforces idempotency and skips duplicate events with the same id', async () => {
      const { worker, idempotency } = build();
      const markSpy = jest.spyOn(idempotency, 'markProcessed');

      await worker.onUsageCompleted(validEvent);
      expect(markSpy).toHaveBeenCalledTimes(1);

      // Second delivery (e.g. from Kafka retry, partition rebalance, or worker restart)
      await worker.onUsageCompleted(validEvent);
      expect(markSpy).toHaveBeenCalledTimes(1); // not called again
    });
  });

  describe('onProviderFailed', () => {
    const validFailedEvent: ProviderFailedEvent = {
      requestId: 'req-2',
      tenantId: '123',
      provider: 'GOOGLE',
      model: 'gemini-2.0-flash',
      errorKind: 'timeout',
      timestamp: new Date().toISOString(),
    };

    it('logs the event without throwing', async () => {
      const { worker } = build();
      await expect(worker.onProviderFailed(validFailedEvent)).resolves.toBeUndefined();
    });

    it('enforces idempotency on failed provider events', async () => {
      const { worker, idempotency } = build();
      const markSpy = jest.spyOn(idempotency, 'markProcessed');

      await worker.onProviderFailed(validFailedEvent);
      expect(markSpy).toHaveBeenCalledTimes(1);

      await worker.onProviderFailed(validFailedEvent);
      expect(markSpy).toHaveBeenCalledTimes(1);
    });
  });
});
