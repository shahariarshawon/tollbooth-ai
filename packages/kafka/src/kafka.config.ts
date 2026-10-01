/**
 * Topics and consumer groups, named here once so a producer and a consumer can never disagree on the
 * string. Adding a topic means adding a constant here, not editing a string literal in two apps.
 */

/** One AI request finished successfully: the event the usage ledger (Phase 7) also records. */
export const KAFKA_USAGE_TOPIC = 'usage.completed';

/** A provider call failed in a way that counts against it (not the caller's own bad request). */
export const KAFKA_PROVIDER_TOPIC = 'provider.failed';

/**
 * One consumer group per topic, so scaling to several worker instances splits that topic's partitions
 * between them (instead of every instance seeing every message), without coupling the two topics'
 * consumers together.
 */
export const KAFKA_USAGE_GROUP = 'tollbooth-worker-usage';
export const KAFKA_PROVIDER_GROUP = 'tollbooth-worker-provider-failed';

/** `KAFKA_BROKER` from `@tollbooth/config` is one host:port, or several separated by commas. */
export function parseBrokers(kafkaBroker: string): string[] {
  return kafkaBroker
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);
}
