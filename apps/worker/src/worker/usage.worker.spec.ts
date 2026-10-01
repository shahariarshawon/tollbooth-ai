import {
  KAFKA_PROVIDER_GROUP,
  KAFKA_PROVIDER_TOPIC,
  KAFKA_USAGE_GROUP,
  KAFKA_USAGE_TOPIC,
} from '@tollbooth/kafka';
import type { KafkaService, ProviderFailedEvent, UsageCompletedEvent } from '@tollbooth/kafka';
import { UsageWorker } from './usage.worker';

function build() {
  const kafka = {
    subscribe: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<KafkaService>;
  return { worker: new UsageWorker(kafka), kafka };
}

describe('UsageWorker', () => {
  describe('onModuleInit', () => {
    it('subscribes to usage.completed and provider.failed, each in its own consumer group', async () => {
      const { worker, kafka } = build();

      await worker.onModuleInit();

      expect(kafka.subscribe).toHaveBeenCalledWith(
        KAFKA_USAGE_TOPIC,
        KAFKA_USAGE_GROUP,
        expect.any(Function),
      );
      expect(kafka.subscribe).toHaveBeenCalledWith(
        KAFKA_PROVIDER_TOPIC,
        KAFKA_PROVIDER_GROUP,
        expect.any(Function),
      );
    });
  });

  describe('onUsageCompleted', () => {
    it('logs the event without throwing', async () => {
      const { worker } = build();
      const event: UsageCompletedEvent = {
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

      await expect(worker.onUsageCompleted(event)).resolves.toBeUndefined();
    });
  });

  describe('onProviderFailed', () => {
    it('logs the event without throwing', async () => {
      const { worker } = build();
      const event: ProviderFailedEvent = {
        requestId: 'req-2',
        tenantId: '123',
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
        errorKind: 'timeout',
        timestamp: new Date().toISOString(),
      };

      await expect(worker.onProviderFailed(event)).resolves.toBeUndefined();
    });
  });
});
