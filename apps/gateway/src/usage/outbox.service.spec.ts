import { OutboxService } from './outbox.service';
import type { PrismaService } from '@tollbooth/database';
import type { KafkaService } from '@tollbooth/kafka';

describe('OutboxService & Transactional Outbox Relay', () => {
  let prisma: {
    outboxEvent: {
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let kafka: {
    publish: jest.Mock;
  };
  let service: OutboxService;

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    kafka = {
      publish: jest.fn().mockResolvedValue(true),
    };
    service = new OutboxService(
      prisma as unknown as PrismaService,
      kafka as unknown as KafkaService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('dispatchImmediately', () => {
    it('publishes to Kafka and marks the outbox event as PUBLISHED when broker is online', async () => {
      kafka.publish.mockResolvedValue(true);

      const published = await service.dispatchImmediately(
        'evt-1',
        'usage.completed',
        { foo: 'bar' },
        't1',
      );

      expect(published).toBe(true);
      expect(kafka.publish).toHaveBeenCalledWith('usage.completed', { foo: 'bar' }, 't1');
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      });
    });

    it('leaves outbox event as PENDING and returns false when Kafka is unavailable', async () => {
      kafka.publish.mockResolvedValue(false);

      const published = await service.dispatchImmediately(
        'evt-2',
        'usage.completed',
        { foo: 'bar' },
        't1',
      );

      expect(published).toBe(false);
      // Status remains PENDING in PostgreSQL: update to PUBLISHED must not be called
      expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('processPendingEvents (Recovery Relay)', () => {
    it('sweeps pending events committed while Kafka was down and publishes them once Kafka recovers', async () => {
      const pendingEvents = [
        {
          id: 'evt-offline-1',
          topic: 'usage.completed',
          eventKey: 'tenant-1',
          payload: { requestId: 'req-1', cost: '0.00000500' },
        },
        {
          id: 'evt-offline-2',
          topic: 'provider.failed',
          eventKey: 'tenant-1',
          payload: { requestId: 'req-2', errorKind: 'timeout' },
        },
      ];

      prisma.outboxEvent.findMany.mockResolvedValue(pendingEvents);
      kafka.publish.mockResolvedValue(true);

      const publishedCount = await service.processPendingEvents(50);

      expect(publishedCount).toBe(2);
      expect(kafka.publish).toHaveBeenCalledTimes(2);
      expect(kafka.publish).toHaveBeenNthCalledWith(
        1,
        'usage.completed',
        pendingEvents[0]!.payload,
        'tenant-1',
      );
      expect(kafka.publish).toHaveBeenNthCalledWith(
        2,
        'provider.failed',
        pendingEvents[1]!.payload,
        'tenant-1',
      );

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-offline-1' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      });
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-offline-2' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      });
    });

    it('increments retryCount when broker is still offline during relay attempt', async () => {
      prisma.outboxEvent.findMany.mockResolvedValue([
        {
          id: 'evt-still-offline',
          topic: 'usage.completed',
          eventKey: 'tenant-1',
          payload: { requestId: 'req-1' },
        },
      ]);
      kafka.publish.mockResolvedValue(false);

      const publishedCount = await service.processPendingEvents(50);

      expect(publishedCount).toBe(0);
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-still-offline' },
        data: {
          retryCount: { increment: 1 },
          lastError: 'Kafka producer unreachable or send failed',
        },
      });
    });
  });
});
