/** Hosts an end-to-end run may write to without asking: the developer machine and CI service containers. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'redis', 'kafka']);

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return connectionString;
  }
}

/**
 * The end-to-end suites create tenants, flush counters and delete rows. A developer `.env` often
 * points at a hosted database or Redis, so a plain `pnpm test:e2e` could write to it. This refuses
 * to run against anything that is not local unless `E2E_ALLOW_REMOTE=true` says it is intended.
 */
export function assertLocalTestTargets(env: NodeJS.ProcessEnv = process.env): void {
  if (env['E2E_ALLOW_REMOTE'] === 'true') return;

  const targets: [string, string | undefined][] = [
    ['DATABASE_URL', env['DATABASE_URL']],
    ['REDIS_URL', env['REDIS_URL']],
    ['REDIS_HOST', env['REDIS_HOST']],
  ];
  const remote = targets
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .filter(([, value]) => !LOCAL_HOSTS.has(hostOf(value)));

  if (remote.length > 0) {
    throw new Error(
      `Refusing to run end-to-end tests against a non-local target: ${remote
        .map(([name, value]) => `${name} (${hostOf(value)})`)
        .join(', ')}. ` +
        'Point them at local containers (see docker-compose.yml), or set E2E_ALLOW_REMOTE=true to override.',
    );
  }
}
