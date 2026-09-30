export type LogSink = (line: string) => void;
export type LogLevel = 'info' | 'warn' | 'error';

const stdout: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

// Silent under test so suites stay readable; tests install their own sink to assert on the output.
let sink: LogSink | null = process.env['NODE_ENV'] === 'test' ? null : stdout;

export function setLogSink(next: LogSink | null): void {
  sink = next;
}

/**
 * Writes one JSON object per line, ready for any log shipper. Callers pass identifiers and timings
 * only: never prompts, completions, API keys or provider responses.
 */
export function logEvent(event: Record<string, unknown>, level: LogLevel = 'info'): void {
  sink?.(JSON.stringify({ timestamp: new Date().toISOString(), level, ...event }));
}
