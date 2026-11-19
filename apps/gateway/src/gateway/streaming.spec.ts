import type { Response } from 'express';
import type { GatewayCacheService } from '../cache/gateway-cache.service';
import type { GatewayRequest } from '../common/types/gateway-request';
import type { AppConfig } from '../config/config.module';
import type { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { AIProvider, ChatCompletionChunk } from '../providers/provider.interface';
import type { ProviderRouter } from '../providers/provider.router';
import type { TokenCounter } from '../tokens/token-counter.service';
import type { TrafficControlService } from '../traffic/traffic-control.service';
import type { UsageService } from '../usage/usage.service';
import { GatewayService } from './gateway.service';
import type { PipelineContext } from './gateway.service';

describe('GatewayService Streaming (F07)', () => {
  let service: GatewayService;
  let mockRouter: { resolve: jest.Mock; resolveCandidates: jest.Mock };
  let mockUsage: { recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let mockTokens: { countMessages: jest.Mock; countText: jest.Mock };
  let mockTraffic: { admit: jest.Mock; abort: jest.Mock; complete: jest.Mock };
  let mockCache: { get: jest.Mock; set: jest.Mock };
  let mockConfig: { GATEWAY_MAX_TOKENS: number };

  const mockProvider: Partial<AIProvider> = {
    id: 'gemini',
    type: 'GOOGLE',
    streamCompletion: jest.fn(),
  };

  const defaultResolvedModel = {
    name: 'gemini-2.0-flash',
    providerId: 'gemini' as const,
    providerType: 'GOOGLE' as const,
    provider: mockProvider as AIProvider,
    prices: {
      input: 0.1,
      output: 0.4,
      tier: 'paid' as const,
    },
    info: {
      name: 'gemini-2.0-flash',
      contextWindow: 1_000_000,
      maxOutputTokens: 8192,
    },
  };

  beforeEach(() => {
    mockRouter = {
      resolve: jest.fn().mockResolvedValue(defaultResolvedModel),
      resolveCandidates: jest.fn().mockResolvedValue([defaultResolvedModel]),
    };
    mockUsage = {
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };
    mockTokens = {
      countMessages: jest.fn().mockReturnValue(12),
      countText: jest.fn().mockReturnValue(8),
    };
    mockTraffic = {
      admit: jest.fn().mockResolvedValue({ id: 'adm-1' }),
      abort: jest.fn(),
      complete: jest.fn().mockResolvedValue(50),
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

  const createContext = (): PipelineContext => ({
    requestId: 'req-stream-123',
    auth: {
      apiKeyId: 'key-123',
      tenantId: 'tenant-456',
      projectId: 'proj-789',
      teamId: 'team-001',
      plan: 'STARTUP',
      permissions: ['chat:completions'],
      rateLimit: null,
      allowedModels: ['gemini-2.0-flash'],
    },
  });

  it('streams SSE chunks, sends correct headers, and terminates with [DONE]', async () => {
    const writtenData: string[] = [];
    const headers: Record<string, string> = {};

    let ended = false;
    const mockResponse = {
      headersSent: false,
      get writableEnded() {
        return ended;
      },
      setHeader: jest.fn((key: string, val: string) => {
        headers[key] = val;
      }),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writtenData.push(chunk);
        return true;
      }),
      end: jest.fn(() => {
        ended = true;
      }),
      on: jest.fn(),
    } as unknown as Response;

    const mockRequest = {
      on: jest.fn(),
    };

    async function* fakeStream(): AsyncIterable<ChatCompletionChunk> {
      yield {
        id: 'chunk-1',
        created: 1700000000,
        model: 'gemini-2.0-flash',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finishReason: null }],
      };
      yield {
        id: 'chunk-2',
        created: 1700000000,
        model: 'gemini-2.0-flash',
        choices: [{ index: 0, delta: { content: ' world!' }, finishReason: null }],
      };
      yield {
        id: 'chunk-3',
        created: 1700000000,
        model: 'gemini-2.0-flash',
        choices: [{ index: 0, delta: {}, finishReason: 'stop' }],
      };
    }

    (mockProvider.streamCompletion as jest.Mock).mockReturnValue(fakeStream());

    const dto: ChatCompletionRequestDto = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Say hello' }],
      stream: true,
    };

    await service.streamChatCompletion(
      createContext(),
      dto,
      mockRequest as unknown as GatewayRequest,
      mockResponse,
    );

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['Connection']).toBe('keep-alive');

    expect(writtenData.length).toBe(4); // 3 data chunks + 1 [DONE]
    expect(writtenData[0]).toContain('"content":"Hello"');
    expect(writtenData[1]).toContain('"content":" world!"');
    expect(writtenData[2]).toContain('"finishReason":"stop"');
    expect(writtenData[3]).toBe('data: [DONE]\n\n');
    expect(mockResponse.end).toHaveBeenCalled();

    // Settle traffic and record success
    expect(mockTraffic.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inputTokens: 12 }),
    );
    expect(mockUsage.recordSuccess).toHaveBeenCalled();
  });

  it('aborts upstream and settles token usage on client disconnect', async () => {
    let clientCloseCallback: (() => void) | undefined;

    const mockRequest = {
      on: jest.fn((event: string, cb: () => void) => {
        if (event === 'close') clientCloseCallback = cb;
      }),
    };

    const mockResponse = {
      headersSent: false,
      writableEnded: false,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    } as unknown as Response;

    async function* infiniteStream(): AsyncIterable<ChatCompletionChunk> {
      yield {
        id: 'chunk-1',
        created: 1700000000,
        model: 'gemini-2.0-flash',
        choices: [{ index: 0, delta: { content: 'partial' }, finishReason: null }],
      };
      // Simulate client dropping connection mid-stream
      clientCloseCallback?.();
      yield {
        id: 'chunk-2',
        created: 1700000000,
        model: 'gemini-2.0-flash',
        choices: [{ index: 0, delta: { content: 'never received' }, finishReason: null }],
      };
    }

    (mockProvider.streamCompletion as jest.Mock).mockReturnValue(infiniteStream());

    const dto: ChatCompletionRequestDto = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Say hello' }],
      stream: true,
    };

    await service.streamChatCompletion(
      createContext(),
      dto,
      mockRequest as unknown as GatewayRequest,
      mockResponse,
    );

    // Only 1 chunk written before disconnect
    expect(mockResponse.write).toHaveBeenCalledTimes(1);
    // Even when interrupted, tokens streamed so far are settled without double charging or abandoning reservation
    expect(mockTraffic.complete).toHaveBeenCalled();
    expect(mockUsage.recordSuccess).toHaveBeenCalled();
  });
});
