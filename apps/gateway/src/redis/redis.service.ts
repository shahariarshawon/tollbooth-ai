import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { logEvent } from '../common/logging/structured-logger';
import { RedisConfigService } from './redis.config';
import { REDIS_STARTUP_WAIT_MS } from './redis.constants';

/** A Lua script, registered once and then called by its cached hash. */
export interface LuaScript {
  name: string;
  /** How many of the arguments are Redis keys (the rest are plain values). */
  keys: number;
  lua: string;
}

export interface RedisHealth {
  healthy: boolean;
  latencyMs?: number;
  /** A short, safe reason. Never includes addresses or credentials. */
  error?: string;
}

type ScriptFunction = (...args: (string | number)[]) => Promise<unknown>;

/** Logging every reconnect attempt would flood the logs during an outage; say it once in a while. */
const ERROR_LOG_INTERVAL_MS = 10_000;

/**
 * The gateway's one Redis connection: created once, shared by every service, closed on shutdown.
 *
 * It never stops the gateway from starting. If Redis is down at boot the client keeps reconnecting in
 * the background, and each traffic control decides what to do meanwhile (see RedisFailurePolicy).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  private readonly registered = new Set<string>();
  private lastErrorLog = 0;

  constructor(private readonly config: RedisConfigService) {
    this.client = new Redis(config.toClientOptions());

    this.client.on('ready', () => logEvent({ event: 'redis_ready', address: config.address }));
    this.client.on('close', () => logEvent({ event: 'redis_disconnected' }, 'warn'));
    this.client.on('error', (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLog < ERROR_LOG_INTERVAL_MS) return;
      this.lastErrorLog = now;
      // The message is logged, never the options: those contain the password.
      logEvent({ event: 'redis_error', address: config.address, message: error.message }, 'error');
    });
  }

  async onModuleInit(): Promise<void> {
    if (await this.waitUntilReady(REDIS_STARTUP_WAIT_MS)) return;
    logEvent(
      { event: 'redis_unavailable_at_startup', address: this.config.address, failOpenHint: true },
      'error',
    );
  }

  async onModuleDestroy(): Promise<void> {
    // quit() lets queued commands finish; fall back to a hard close if Redis is already gone.
    await this.client.quit().catch(() => this.client.disconnect());
  }

  /** Round-trips a PING and reports how long it took. Used by GET /health/redis. */
  async health(): Promise<RedisHealth> {
    const started = performance.now();
    try {
      await this.client.ping();
      return { healthy: true, latencyMs: Math.max(1, Math.round(performance.now() - started)) };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? shortReason(error) : 'unreachable' };
    }
  }

  /** Runs a Lua script atomically on the server. */
  run(script: LuaScript, keys: string[], args: (string | number)[] = []): Promise<unknown> {
    if (!this.registered.has(script.name)) {
      this.client.defineCommand(script.name, { numberOfKeys: script.keys, lua: script.lua });
      this.registered.add(script.name);
    }
    const command = (this.client as unknown as Record<string, ScriptFunction>)[script.name];
    if (!command) throw new Error(`Script ${script.name} was not registered`);
    return command.call(this.client, ...keys, ...args);
  }

  private async waitUntilReady(timeoutMs: number): Promise<boolean> {
    if (this.client.status === 'ready') return true;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => finish(false), timeoutMs);
      const finish = (ready: boolean) => {
        clearTimeout(timer);
        this.client.off('ready', onReady);
        resolve(ready);
      };
      const onReady = () => finish(true);
      this.client.once('ready', onReady);
    });
  }
}

function shortReason(error: Error): string {
  if (/timed out/i.test(error.message)) return 'Redis did not answer in time';
  return 'Redis is not reachable';
}
