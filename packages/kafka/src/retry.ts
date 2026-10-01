const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a transient failure a bounded number of times with a short linear backoff, then gives up and
 * rethrows. Used for one message handler call (Task 6's "consumer retry"), not for the broker connection
 * itself, which kafkajs already retries internally per the `retry` option on the `Kafka` client.
 */
export async function withBoundedRetry<T>(
  attempt: () => Promise<T>,
  maxRetries: number,
  delayMs: (attemptNumber: number) => number = (attemptNumber) => attemptNumber * 200,
): Promise<T> {
  for (let attemptNumber = 0; ; attemptNumber++) {
    try {
      return await attempt();
    } catch (error) {
      if (attemptNumber >= maxRetries) throw error;
      await sleep(delayMs(attemptNumber + 1));
    }
  }
}

/** A short, log-friendly message from anything that can be thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
