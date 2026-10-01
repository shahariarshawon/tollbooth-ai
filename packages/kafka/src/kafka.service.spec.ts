import type { EachMessagePayload } from 'kafkajs';

const mockProducer = { connect: jest.fn(), disconnect: jest.fn(), send: jest.fn() };
const mockConsumer = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  subscribe: jest.fn(),
  run: jest.fn(),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => mockProducer,
    consumer: () => mockConsumer,
  })),
  logLevel: { NOTHING: 0 },
}));

// Imported after the mock so the service picks up the mocked kafkajs module.
import { KafkaService } from './kafka.service';

function build(overrides: { maxMessageRetries?: number } = {}): KafkaService {
  return new KafkaService({ clientId: 'test', brokers: ['localhost:9092'], ...overrides });
}

describe('KafkaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('connects the producer', async () => {
      mockProducer.connect.mockResolvedValue(undefined);
      await build().onModuleInit();
      expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    });

    it('does not throw when the producer cannot connect', async () => {
      mockProducer.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(build().onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('publish', () => {
    it('sends the payload as JSON once connected', async () => {
      mockProducer.connect.mockResolvedValue(undefined);
      mockProducer.send.mockResolvedValue(undefined);
      const service = build();
      await service.onModuleInit();

      const sent = await service.publish('usage.completed', { a: 1 }, 'tenant-1');

      expect(sent).toBe(true);
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'usage.completed',
        messages: [{ key: 'tenant-1', value: JSON.stringify({ a: 1 }) }],
      });
    });

    it('is a no-op, not a throw, when the producer never connected', async () => {
      mockProducer.connect.mockRejectedValue(new Error('down'));
      const service = build();
      await service.onModuleInit();

      await expect(service.publish('usage.completed', { a: 1 })).resolves.toBe(false);
      expect(mockProducer.send).not.toHaveBeenCalled();
    });

    it('returns false, and does not throw, when send() itself fails', async () => {
      mockProducer.connect.mockResolvedValue(undefined);
      mockProducer.send.mockRejectedValue(new Error('broker gone'));
      const service = build();
      await service.onModuleInit();

      await expect(service.publish('usage.completed', { a: 1 })).resolves.toBe(false);
    });
  });

  describe('subscribe', () => {
    const connectConsumer = () => {
      mockConsumer.connect.mockResolvedValue(undefined);
      mockConsumer.subscribe.mockResolvedValue(undefined);
    };
    const captureHandler = (): (() => (args: EachMessagePayload) => Promise<void>) => {
      let handler: (args: EachMessagePayload) => Promise<void> = async () => undefined;
      mockConsumer.run.mockImplementation(
        async (config: { eachMessage: (args: EachMessagePayload) => Promise<void> }) => {
          handler = config.eachMessage;
        },
      );
      return () => handler;
    };
    const message = (value: object | null) =>
      ({
        message: { value: value ? Buffer.from(JSON.stringify(value)) : null },
      }) as EachMessagePayload;

    it('connects, subscribes, and calls onMessage with the parsed payload', async () => {
      connectConsumer();
      const getHandler = captureHandler();
      const onMessage = jest.fn().mockResolvedValue(undefined);

      await build().subscribe('usage.completed', 'worker-group', onMessage);

      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'usage.completed',
        fromBeginning: false,
      });
      await getHandler()(message({ tenantId: 't1' }));
      expect(onMessage).toHaveBeenCalledWith({ tenantId: 't1' });
    });

    it('skips a message with no value, without calling onMessage', async () => {
      connectConsumer();
      const getHandler = captureHandler();
      const onMessage = jest.fn();

      await build().subscribe('usage.completed', 'worker-group', onMessage);
      await getHandler()(message(null));

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('retries a failing handler and gives up after maxMessageRetries, without throwing', async () => {
      connectConsumer();
      const getHandler = captureHandler();
      const onMessage = jest.fn().mockRejectedValue(new Error('boom'));

      await build({ maxMessageRetries: 1 }).subscribe('usage.completed', 'worker-group', onMessage);
      await expect(getHandler()(message({}))).resolves.toBeUndefined();

      expect(onMessage).toHaveBeenCalledTimes(2); // the first attempt plus 1 retry
    });

    it('does not throw when the consumer cannot connect', async () => {
      mockConsumer.connect.mockRejectedValue(new Error('down'));
      await expect(build().subscribe('usage.completed', 'g', jest.fn())).resolves.toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects the producer and every subscribed consumer', async () => {
      mockProducer.connect.mockResolvedValue(undefined);
      mockProducer.disconnect.mockResolvedValue(undefined);
      mockConsumer.connect.mockResolvedValue(undefined);
      mockConsumer.subscribe.mockResolvedValue(undefined);
      mockConsumer.run.mockResolvedValue(undefined);
      mockConsumer.disconnect.mockResolvedValue(undefined);

      const service = build();
      await service.onModuleInit();
      await service.subscribe('usage.completed', 'g', jest.fn());

      await service.onModuleDestroy();

      expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
      expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
    });

    it('does not try to disconnect a producer that never connected', async () => {
      mockProducer.connect.mockRejectedValue(new Error('down'));
      const service = build();
      await service.onModuleInit();

      await service.onModuleDestroy();

      expect(mockProducer.disconnect).not.toHaveBeenCalled();
    });
  });
});
