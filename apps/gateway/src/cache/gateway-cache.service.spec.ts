import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import type { RedisService } from '../redis/redis.service';
import { GatewayCacheService } from './gateway-cache.service';

describe('GatewayCacheService (F10 Tenant-Aware Caching)', () => {
  let cacheService: GatewayCacheService;
  let mockRedisClient: {
    get: jest.Mock;
    set: jest.Mock;
  };

  const sampleDto: ChatCompletionRequestDto = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'What is the speed of light?' }],
    temperature: 0.2,
    max_tokens: 100,
  };

  const sampleResponse: ChatCompletionResponse = {
    id: 'chatcmpl-test-123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'About 299,792,458 m/s.' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 12,
      total_tokens: 22,
      estimated_cost: '0.00005',
    },
  };

  beforeEach(() => {
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const mockRedisService = {
      client: mockRedisClient,
    } as unknown as RedisService;

    cacheService = new GatewayCacheService(mockRedisService);
  });

  it('computes distinct, tenant-isolated cache keys for different tenants with identical prompts', () => {
    const keyTenantA = cacheService.computeCacheKey('tenant-alpha', sampleDto);
    const keyTenantB = cacheService.computeCacheKey('tenant-beta', sampleDto);

    expect(keyTenantA).not.toEqual(keyTenantB);
    expect(keyTenantA).toContain('gateway_cache:tenant-alpha:');
    expect(keyTenantB).toContain('gateway_cache:tenant-beta:');
  });

  it('returns cached response on cache hit and updates metrics', async () => {
    mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(sampleResponse));

    const result = await cacheService.get('tenant-alpha', sampleDto);

    expect(result).toEqual(sampleResponse);
    expect(mockRedisClient.get).toHaveBeenCalledTimes(1);

    const metrics = cacheService.getMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(0);
    expect(metrics.ratio).toBe(1);
  });

  it('returns null on cache miss and records miss metric', async () => {
    mockRedisClient.get.mockResolvedValueOnce(null);

    const result = await cacheService.get('tenant-alpha', sampleDto);

    expect(result).toBeNull();
    const metrics = cacheService.getMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(1);
    expect(metrics.ratio).toBe(0);
  });

  it('bypasses cache when stream is true or temperature is high', async () => {
    const streamingDto: ChatCompletionRequestDto = {
      ...sampleDto,
      stream: true,
    };
    const highTempDto: ChatCompletionRequestDto = {
      ...sampleDto,
      temperature: 0.95,
    };

    expect(await cacheService.get('tenant-alpha', streamingDto)).toBeNull();
    expect(await cacheService.get('tenant-alpha', highTempDto)).toBeNull();
    expect(mockRedisClient.get).not.toHaveBeenCalled();

    await cacheService.set('tenant-alpha', streamingDto, sampleResponse);
    await cacheService.set('tenant-alpha', highTempDto, sampleResponse);
    expect(mockRedisClient.set).not.toHaveBeenCalled();
  });

  it('gracefully fails open when Redis throws an unexpected error', async () => {
    mockRedisClient.get.mockRejectedValueOnce(new Error('Redis connection reset'));

    const result = await cacheService.get('tenant-alpha', sampleDto);

    expect(result).toBeNull();
    // Cache set should also fail silently without throwing
    mockRedisClient.set.mockRejectedValueOnce(new Error('Redis OOM'));
    await expect(
      cacheService.set('tenant-alpha', sampleDto, sampleResponse),
    ).resolves.toBeUndefined();
  });
});
