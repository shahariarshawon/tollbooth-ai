import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { cacheHitsTotal, cacheMissesTotal } from '../metrics/metrics';
import { RedisService } from '../redis/redis.service';

/**
 * Tenant-isolated exact-match cache for chat completions.
 *
 * Guarantees strict multi-tenant boundary separation: cache keys incorporate the tenant ID
 * in both the Redis key namespace and the SHA-256 payload digest.
 * Gracefully fails open if Redis is unreachable so inference traffic is never interrupted.
 */
@Injectable()
export class GatewayCacheService {
  private readonly logger = new Logger(GatewayCacheService.name);
  private hits = 0;
  private misses = 0;

  constructor(private readonly redis: RedisService) {}

  /**
   * Generates a deterministic, tenant-isolated cache key.
   */
  computeCacheKey(tenantId: string, dto: ChatCompletionRequestDto): string {
    const canonical = {
      tenantId,
      model: dto.model,
      messages: dto.messages,
      temperature: dto.temperature ?? 1,
      topP: dto.top_p ?? 1,
      maxTokens: dto.max_tokens ?? null,
    };
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    return `gateway_cache:${tenantId}:${digest}`;
  }

  /**
   * Looks up a cached completion. Fails open (returns null) on any error.
   */
  async get(
    tenantId: string,
    dto: ChatCompletionRequestDto,
  ): Promise<ChatCompletionResponse | null> {
    if (dto.stream === true || (dto.temperature !== undefined && dto.temperature > 0.8)) {
      return null;
    }

    try {
      const key = this.computeCacheKey(tenantId, dto);
      const raw = await this.redis.client.get(key);
      if (raw) {
        this.hits++;
        cacheHitsTotal.inc({ tenant_id: tenantId, model: dto.model });
        return JSON.parse(raw) as ChatCompletionResponse;
      }
      this.misses++;
      cacheMissesTotal.inc({ tenant_id: tenantId, model: dto.model });
      return null;
    } catch (error) {
      this.logger.debug(`Cache lookup failed gracefully: ${String(error)}`);
      this.misses++;
      return null;
    }
  }

  /**
   * Stores a completion with TTL.
   */
  async set(
    tenantId: string,
    dto: ChatCompletionRequestDto,
    response: ChatCompletionResponse,
    ttlSeconds = 3600,
  ): Promise<void> {
    if (dto.stream === true || (dto.temperature !== undefined && dto.temperature > 0.8)) {
      return;
    }

    try {
      const key = this.computeCacheKey(tenantId, dto);
      await this.redis.client.set(key, JSON.stringify(response), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.debug(`Cache write failed gracefully: ${String(error)}`);
    }
  }

  getMetrics(): { hits: number; misses: number; total: number; ratio: number } {
    const total = this.hits + this.misses;
    const ratio = total > 0 ? this.hits / total : 0;
    return { hits: this.hits, misses: this.misses, total, ratio };
  }
}
