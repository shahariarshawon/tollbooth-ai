import type { GatewayCacheService } from '../cache/gateway-cache.service';
import { GatewayException } from '../common/errors/gateway.exception';
import type { ApiKeyAuth } from '../common/types/gateway-request';
import type { AppConfig } from '../config/config.module';
import type { ProviderRouter } from '../providers/provider.router';
import type { TokenCounter } from '../tokens/token-counter.service';
import type { TrafficControlService } from '../traffic/traffic-control.service';
import type { UsageService } from '../usage/usage.service';
import { GatewayService } from './gateway.service';
import type { PipelineContext } from './gateway.service';

describe('GatewayService - Model Authorization Integration', () => {
  let service: GatewayService;
  let mockRouter: { resolve: jest.Mock };
  let mockUsage: { recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let mockTokens: { countMessages: jest.Mock };
  let mockTraffic: { admit: jest.Mock; abort: jest.Mock; complete: jest.Mock };
  let mockConfig: { GATEWAY_MAX_TOKENS: number };

  beforeEach(() => {
    mockRouter = {
      resolve: jest.fn(),
    };
    mockUsage = {
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };
    mockTokens = {
      countMessages: jest.fn().mockReturnValue(10),
    };
    mockTraffic = {
      admit: jest.fn(),
      abort: jest.fn(),
      complete: jest.fn(),
    };
    mockConfig = {
      GATEWAY_MAX_TOKENS: 4096,
    };

    const mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new GatewayService(
      mockRouter as unknown as ProviderRouter,
      mockUsage as unknown as UsageService,
      mockTokens as unknown as TokenCounter,
      mockTraffic as unknown as TrafficControlService,
      mockCache as unknown as GatewayCacheService,
      mockConfig as unknown as AppConfig,
    );
  });

  const createContext = (allowedModels?: string[]): PipelineContext => ({
    requestId: 'req-test-123',
    auth: {
      apiKeyId: 'key-123',
      tenantId: 'tenant-456',
      projectId: 'proj-789',
      teamId: 'team-001',
      plan: 'STARTUP',
      permissions: ['chat:completions'],
      rateLimit: null,
      allowedModels,
    } as ApiKeyAuth,
  });

  it('rejects gpt-4o-mini when team only allows gpt-4o (F03 substring regression test)', async () => {
    const ctx = createContext(['gpt-4o']);

    let caughtError: unknown;
    try {
      await service.createChatCompletion(ctx, {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(GatewayException);
    const gatewayErr = caughtError as GatewayException;
    expect(gatewayErr.getStatus()).toBe(400);
    expect(gatewayErr.payload).toMatchObject({
      type: 'invalid_request_error',
      code: 'model_not_allowed',
      param: 'model',
    });
    expect(gatewayErr.payload.message).toContain(
      "Model 'gpt-4o-mini' is not permitted for your team",
    );
    expect(gatewayErr.payload.message).toContain('Allowed models: gpt-4o');
    // Ensure router.resolve was NEVER called (short-circuit before provider work)
    expect(mockRouter.resolve).not.toHaveBeenCalled();
  });

  it('rejects gemini-2.0-flash-lite when team only allows gemini-2.0-flash', async () => {
    const ctx = createContext(['gemini-2.0-flash']);

    await expect(
      service.createChatCompletion(ctx, {
        model: 'gemini-2.0-flash-lite',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toMatchObject({
      payload: {
        code: 'model_not_allowed',
        param: 'model',
      },
    });

    expect(mockRouter.resolve).not.toHaveBeenCalled();
  });

  it('rejects shorter prefix gpt-4 when team allows gpt-4o', async () => {
    const ctx = createContext(['gpt-4o']);

    await expect(
      service.createChatCompletion(ctx, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toMatchObject({
      payload: {
        code: 'model_not_allowed',
        param: 'model',
      },
    });

    expect(mockRouter.resolve).not.toHaveBeenCalled();
  });

  it('allows exact match and proceeds to router.resolve', async () => {
    const ctx = createContext(['gpt-4o']);
    mockRouter.resolve.mockResolvedValueOnce({
      name: 'gpt-4o',
      providerId: 'openai',
      providerType: 'OPENAI',
      provider: {
        chatCompletion: jest.fn().mockResolvedValue({
          id: 'fake-id',
          model: 'gpt-4o',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
          ],
          created: 123456,
        }),
        calculateUsage: jest
          .fn()
          .mockReturnValue({ requestTokens: 5, responseTokens: 5, totalTokens: 10 }),
      },
      prices: { input: 2.5, output: 10, tier: 'paid' },
      info: { contextWindow: 128000, maxOutputTokens: 16384 },
    });
    mockTraffic.admit.mockResolvedValueOnce({ lease: 'lease-1' });
    mockTraffic.complete.mockResolvedValueOnce(100);

    const response = await service.createChatCompletion(ctx, {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(mockRouter.resolve).toHaveBeenCalledWith('gpt-4o');
    expect(response).toBeDefined();
    expect(response.model).toBe('gpt-4o');
  });

  it('allows alias models/gemini-2.0-flash when team allows gemini-2.0-flash', async () => {
    const ctx = createContext(['gemini-2.0-flash']);
    mockRouter.resolve.mockResolvedValueOnce({
      name: 'gemini-2.0-flash',
      providerId: 'gemini',
      providerType: 'GOOGLE',
      provider: {
        chatCompletion: jest.fn().mockResolvedValue({
          id: 'fake-id',
          model: 'gemini-2.0-flash',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
          ],
          created: 123456,
        }),
        calculateUsage: jest
          .fn()
          .mockReturnValue({ requestTokens: 5, responseTokens: 5, totalTokens: 10 }),
      },
      prices: { input: 0.1, output: 0.4, tier: 'free' },
      info: { contextWindow: 1048576, maxOutputTokens: 8192 },
    });
    mockTraffic.admit.mockResolvedValueOnce({ lease: 'lease-1' });
    mockTraffic.complete.mockResolvedValueOnce(0);

    const response = await service.createChatCompletion(ctx, {
      model: 'models/gemini-2.0-flash',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(mockRouter.resolve).toHaveBeenCalledWith('models/gemini-2.0-flash');
    expect(response).toBeDefined();
  });

  it('permits any model when allowedModels is empty array or undefined (unrestricted)', async () => {
    const ctx = createContext([]);
    mockRouter.resolve.mockResolvedValueOnce({
      name: 'gemini-2.0-flash',
      providerId: 'gemini',
      providerType: 'GOOGLE',
      provider: {
        chatCompletion: jest.fn().mockResolvedValue({
          id: 'fake-id',
          model: 'gemini-2.0-flash',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
          ],
          created: 123456,
        }),
        calculateUsage: jest
          .fn()
          .mockReturnValue({ requestTokens: 5, responseTokens: 5, totalTokens: 10 }),
      },
      prices: { input: 0.1, output: 0.4, tier: 'free' },
      info: { contextWindow: 1048576, maxOutputTokens: 8192 },
    });
    mockTraffic.admit.mockResolvedValueOnce({ lease: 'lease-1' });
    mockTraffic.complete.mockResolvedValueOnce(0);

    await service.createChatCompletion(ctx, {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(mockRouter.resolve).toHaveBeenCalledWith('gemini-2.0-flash');
  });
});
