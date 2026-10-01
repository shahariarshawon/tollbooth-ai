import { parseBrokers } from '../src/kafka.config';
import { KafkaService } from '../src/kafka.service';

/**
 * Against the real Kafka broker from docker-compose (`pnpm infra:up`), not a mock: this is what actually
 * proves Task 8's "producer sends event" / "consumer receives event", not just that the wrapper calls the
 * kafkajs methods it is supposed to (that part is `src/kafka.service.spec.ts`, which runs in CI).
 *
 * Not run by CI: CI has no Kafka service (see docs/architecture/kafka-events.md). Run locally with
 * Kafka up: `pnpm infra:up && pnpm --filter @tollbooth/kafka test:e2e`.
 */
describe('Kafka (real broker, e2e)', () => {
  let service: KafkaService;
  const topic = `test.kafka.e2e.${Date.now()}`;

  beforeAll(async () => {
    service = new KafkaService({
      clientId: 'kafka-package-e2e',
      brokers: parseBrokers(process.env['KAFKA_BROKER'] ?? 'localhost:9094'),
    });
    await service.onModuleInit();
    // The topic is brand new (its name includes Date.now()). Auto-creating it through a producer send,
    // and giving the cluster a moment to propagate that metadata, avoids every test below racing a
    // consumer subscribe against a topic the broker does not know about yet ("This server does not host
    // this topic-partition").
    await service.publish(topic, { init: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  const waitUntil = async (condition: () => boolean, timeoutMs: number): Promise<void> => {
    const startedAt = Date.now();
    while (!condition()) {
      if (Date.now() - startedAt > timeoutMs)
        throw new Error('Timed out waiting for the condition');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  it('a producer sends an event and a consumer in its own group receives it', async () => {
    const received: { hello: string }[] = [];
    await service.subscribe<{ hello: string }>(
      topic,
      `group-basic-${Date.now()}`,
      async (payload) => {
        received.push(payload);
      },
    );
    // Joining a consumer group takes a moment; publishing immediately would race it.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const sent = await service.publish(topic, { hello: 'world' });
    expect(sent).toBe(true);

    await waitUntil(() => received.length > 0, 15_000);
    expect(received[0]).toEqual({ hello: 'world' });
  });

  it('delivers several events in order to the same consumer', async () => {
    const received: { n: number }[] = [];
    await service.subscribe<{ n: number }>(topic, `group-order-${Date.now()}`, async (payload) => {
      received.push(payload);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (let n = 0; n < 5; n++) await service.publish(topic, { n }, 'same-key');

    await waitUntil(() => received.length >= 5, 15_000);
    expect(received.map((event) => event.n)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a handler that throws is retried and then the next message still gets through', async () => {
    const received: { n: number }[] = [];
    let attempts = 0;
    const flaky = new KafkaService({
      clientId: 'kafka-package-e2e-flaky',
      brokers: parseBrokers(process.env['KAFKA_BROKER'] ?? 'localhost:9094'),
      maxMessageRetries: 2,
    });
    await flaky.onModuleInit();
    try {
      await flaky.subscribe<{ n: number }>(topic, `group-flaky-${Date.now()}`, async (payload) => {
        attempts++;
        // The very first delivery fails twice before succeeding, within the retry budget.
        if (payload.n === 0 && attempts <= 2) throw new Error('transient');
        received.push(payload);
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await flaky.publish(topic, { n: 0 });
      await flaky.publish(topic, { n: 1 });

      await waitUntil(() => received.length >= 2, 15_000);
      expect(received).toEqual([{ n: 0 }, { n: 1 }]);
      expect(attempts).toBeGreaterThanOrEqual(3); // 2 failures + the success, for n: 0 alone
    } finally {
      await flaky.onModuleDestroy();
    }
  });
});
