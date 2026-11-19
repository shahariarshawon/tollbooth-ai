import { GatewayErrors } from '../common/errors/gateway.exception';
import { ProviderUnavailableException } from '../common/errors/traffic.exceptions';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import { ProviderError } from '../providers/provider.interface';
import type { AIProvider } from '../providers/provider.interface';
import type { ProviderRouter, ResolvedModel } from '../providers/provider.router';
import type { TokenCounter } from '../tokens/token-counter.service';
import type { TrafficControlService } from '../traffic/traffic-control.service';
import type { UsageService } from '../usage/usage.service';
import type { GatewayCacheService } from '../cache/gateway-cache.service';
import type { AppConfig } from '../config/config.module';
import { GatewayService } from './gateway.service';
import type { PipelineContext } from './gateway.service';

describe('GatewayService Failover (F08)', () => {
  let service: GatewayService;
  let mockRouter: { resolve: jest.Mock; resolveCandidates: jest.Mock };
  let mockUsage: { recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let mockTokens: { countMessages: jest.Mock };
  let mockTraffic: { admit: jest.Mock; abort: jest.Mock; complete: jest.Mock };
  let mockCache: { get: jest.Mock; set: jest.Mock };
  let mockConfig: { GATEWAY_MAX_TOKENS: number };

  const providerPrimary: Partial<AIProvider> = {
    id: 'openai',
    type: 'OPENAI',
    chatCompletion: jest.fn(),
    calculateUsage: jest
      .fn()
      .mockReturnValue({ requestTokens: 10, responseTokens: 15, totalTokens: 25 }),
  };

  const providerFallback: Partial<AIProvider> = {
    id: 'gemini',
    type: 'GOOGLE',
    chatCompletion: jest.fn(),
    calculateUsage: jest
      .fn()
      .mockReturnValue({ requestTokens: 10, responseTokens: 15, totalTokens: 25 }),
  };

  const candidatePrimary: ResolvedModel = {
    name: 'gpt-4o',
    providerId: 'openai',
    providerType: 'OPENAI',
    provider: providerPrimary as AIProvider,
    prices: { input: 2.5, output: 10, tier: 'paid' } as unknown as ResolvedModel['prices'],
    info: { name: 'gpt-4o', contextWindow: 128000, maxOutputTokens: 4096 },
  };

  const candidateFallback: ResolvedModel = {
    name: 'gemini-2.0-flash',
    providerId: 'gemini',
    providerType: 'GOOGLE',
    provider: providerFallback as AIProvider,
    prices: { input: 0.1, output: 0.4, tier: 'paid' } as unknown as ResolvedModel['prices'],
    info: { name: 'gemini-2.0-flash', contextWindow: 1000000, maxOutputTokens: 8192 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter = {
      resolve: jest.fn().mockResolvedValue(candidatePrimary),
      resolveCandidates: jest.fn().mockResolvedValue([candidatePrimary, candidateFallback]),
    };
    mockUsage = {
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };
    mockTokens = {
      countMessages: jest.fn().mockReturnValue(10),
    };
    mockTraffic = {
      admit: jest.fn().mockResolvedValue({ id: 'adm-test' }),
      abort: jest.fn(),
      complete: jest.fn().mockResolvedValue(100),
    };
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockConfig = {
      GATEWAY_MAX_TOKENS: 4096,
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

  const createContext = (allowedModels = ['gpt-4o', 'gemini-2.0-flash']): PipelineContext => ({
    requestId: 'req-failover-123',
    auth: {
      apiKeyId: 'key-123',
      tenantId: 'tenant-456',
      projectId: 'proj-789',
      teamId: 'team-001',
      plan: 'STARTUP',
      permissions: ['chat:completions'],
      rateLimit: null,
      allowedModels,
    },
  });

  const sampleDto: ChatCompletionRequestDto = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'test prompt' }],
  };

  it('fails over to secondary provider when primary encounters a 503 unavailable error', async () => {
    // Primary fails with 503
    (providerPrimary.chatCompletion as jest.Mock).mockRejectedValueOnce(
      new ProviderError('unavailable', 'Service unavailable'),
    );
    // Fallback succeeds
    (providerFallback.chatCompletion as jest.Mock).mockResolvedValueOnce({
      id: 'chatcmpl-fallback-123',
      created: 1700000000,
      model: 'gemini-2.0-flash',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Fallback response' },
          finishReason: 'stop',
        },
      ],
    });

    const response = await service.createChatCompletion(createContext(), sampleDto);

    expect(response.choices[0]?.message.content).toBe('Fallback response');
    // Traffic for primary was aborted without double charging
    expect(mockTraffic.abort).toHaveBeenCalledWith(expect.anything(), 'provider_failure');
    // Secondary was admitted and completed
    expect(mockTraffic.admit).toHaveBeenCalledTimes(2);
    expect(mockTraffic.complete).toHaveBeenCalledTimes(1);
    // Attribution recorded on the winning fallback provider
    expect(mockUsage.recordSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'GOOGLE',
        model: 'gemini-2.0-flash',
      }),
    );
  });

  it('does NOT fail over on a caller error (400 bad request)', async () => {
    (providerPrimary.chatCompletion as jest.Mock).mockRejectedValueOnce(
      new ProviderError('bad_request', 'Invalid temperature parameter'),
    );

    await expect(service.createChatCompletion(createContext(), sampleDto)).rejects.toThrow(
      GatewayErrors.invalidRequest(
        'The provider rejected the request: Invalid temperature parameter',
      ).message,
    );

    // Fallback is never attempted on 400
    expect(providerFallback.chatCompletion).not.toHaveBeenCalled();
    expect(mockTraffic.abort).toHaveBeenCalledWith(expect.anything(), 'caller_error');
    expect(mockUsage.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: 'bad_request',
      }),
    );
  });

  it('skips fallback candidate if team is not authorized for that model', async () => {
    // Tenant is ONLY authorized for gpt-4o, NOT gemini-2.0-flash
    const restrictedContext = createContext(['gpt-4o']);

    (providerPrimary.chatCompletion as jest.Mock).mockRejectedValueOnce(
      new ProviderError('timeout', 'Primary timed out'),
    );

    await expect(service.createChatCompletion(restrictedContext, sampleDto)).rejects.toThrow(
      ProviderUnavailableException,
    );

    // gemini was not called because tenant lacks model authorization
    expect(providerFallback.chatCompletion).not.toHaveBeenCalled();
  });
});
