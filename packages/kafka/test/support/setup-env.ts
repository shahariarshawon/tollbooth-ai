import { loadDotEnv } from '@tollbooth/config';

// Local runs read the repository .env (KAFKA_BROKER=localhost:9094, matching docker-compose's external
// listener). CI does not run these tests (no Kafka service is defined there); see the package README note
// in docs/architecture/kafka-events.md.
loadDotEnv();
