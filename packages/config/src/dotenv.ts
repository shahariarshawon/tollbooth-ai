import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads the nearest `.env` (walking up from the working directory) without overriding variables
 * that are already set. Intended for local development and tests; production uses real env vars.
 */
export function loadDotEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      // Assign explicitly (rather than process.loadEnvFile) so it also works where `process.env`
      // is a per-context copy, such as inside Jest.
      for (const [key, value] of Object.entries(parseEnv(readFileSync(candidate, 'utf8')))) {
        process.env[key] ??= value;
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
