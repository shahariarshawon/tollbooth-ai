import type { AppConfig } from '../config/config.module';
import { TokenCounter } from '../tokens/token-counter.service';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import type { AIProvider, ChatCompletionRequest, ChatCompletionResult } from './provider.interface';

const tokens = new TokenCounter();

const baseConfig = {
  GOOGLE_AI_BASE_URL: 'http://localhost:1/v1beta',
  ANTHROPIC_BASE_URL: 'http://localhost:1',
  OPENAI_BASE_URL: 'http://localhost:1/v1',
  GATEWAY_PROVIDER_TIMEOUT_MS: 1000,
} as const;

const build = (keys: Partial<AppConfig> = {}) => ({
  gemini: new GeminiProvider({ ...baseConfig, ...keys } as AppConfig, tokens),
  openai: new OpenAIProvider({ ...baseConfig, ...keys } as AppConfig, tokens),
  anthropic: new AnthropicProvider({ ...baseConfig, ...keys } as AppConfig, tokens),
});

const configured = build({
  GOOGLE_AI_API_KEY: 'g',
  OPENAI_API_KEY: 'o',
  ANTHROPIC_API_KEY: 'a',
});

const request: ChatCompletionRequest = {
  model: 'gemini-2.0-flash',
  messages: [{ role: 'user', content: 'Hello there' }],
};
const result = (usage?: ChatCompletionResult['usage']): ChatCompletionResult => ({
  id: 'x',
  created: 1,
  model: 'm',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'A reply of some words' },
      finishReason: 'stop',
    },
  ],
  ...(usage && { usage }),
});

/** Every provider must satisfy the same contract, so the gateway can treat them alike. */
describe.each<[string, AIProvider, string, string]>([
  ['Gemini', configured.gemini, 'gemini', 'GOOGLE'],
  ['OpenAI', configured.openai, 'openai', 'OPENAI'],
  ['Anthropic', configured.anthropic, 'anthropic', 'ANTHROPIC'],
])('AIProvider contract: %s', (_name, provider, id, type) => {
  it('identifies itself with a short id and its database provider type', () => {
    expect(provider.id).toBe(id);
    expect(provider.type).toBe(type);
  });

  it('implements chatCompletion, getModelInfo and calculateUsage', () => {
    expect(typeof provider.chatCompletion).toBe('function');
    expect(typeof provider.getModelInfo).toBe('function');
    expect(typeof provider.calculateUsage).toBe('function');
    expect(typeof provider.isConfigured).toBe('function');
  });

  it('names itself for logs and the dashboard', () => {
    expect(typeof provider.getProviderName()).toBe('string');
    expect(provider.getProviderName().length).toBeGreaterThan(0);
  });

  it('validates a model it knows and rejects one it does not', () => {
    expect(provider.validateModel('gemini-2.0-flash')).toBe(id === 'gemini');
    expect(provider.validateModel('not-a-real-model')).toBe(false);
  });

  it('rejects streamCompletion with a classified, not-yet-supported error', async () => {
    await expect(provider.streamCompletion(request)).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'bad_request',
    });
  });

  it('is configured when it has a key', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('returns undefined for a model it does not know', () => {
    expect(provider.getModelInfo('not-a-real-model')).toBeUndefined();
  });

  it('trusts the usage the provider reported', () => {
    expect(
      provider.calculateUsage(
        request,
        result({ promptTokens: 11, completionTokens: 22, totalTokens: 33 }),
      ),
    ).toEqual({ requestTokens: 11, responseTokens: 22, totalTokens: 33 });
  });

  it('estimates usage when the provider reported none, with a consistent total', () => {
    const usage = provider.calculateUsage(request, result());
    expect(usage.requestTokens).toBeGreaterThan(0);
    expect(usage.responseTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.requestTokens + usage.responseTokens);
  });

  it('refuses to call out without credentials, with a classified error', async () => {
    const bare = build();
    const unconfigured = { gemini: bare.gemini, openai: bare.openai, anthropic: bare.anthropic }[
      id as 'gemini' | 'openai' | 'anthropic'
    ];
    expect(unconfigured.isConfigured()).toBe(false);
    await expect(unconfigured.chatCompletion(request)).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'unavailable',
    });
  });
});

describe('providers are distinct', () => {
  it('have different ids and types, so the router and circuit breaker can tell them apart', () => {
    const all = Object.values(configured);
    expect(new Set(all.map((provider) => provider.id)).size).toBe(3);
    expect(new Set(all.map((provider) => provider.type)).size).toBe(3);
  });
});

describe('model info', () => {
  it('knows the limits of the Gemini models in the catalogue', () => {
    expect(configured.gemini.getModelInfo('gemini-2.0-flash')).toEqual({
      name: 'gemini-2.0-flash',
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
    });
    expect(configured.gemini.getModelInfo('gemini-2.5-pro')?.maxOutputTokens).toBe(65_536);
  });

  it('does not answer for another provider models', () => {
    expect(configured.gemini.getModelInfo('gpt-4')).toBeUndefined();
    expect(configured.openai.getModelInfo('gemini-2.0-flash')).toBeUndefined();
    expect(configured.anthropic.getModelInfo('gpt-4o')).toBeUndefined();
  });
});

describe('Gemini specifics', () => {
  it('counts reasoning tokens as output in the usage it reports', () => {
    // fromGeminiResponse puts them in usage; calculateUsage must keep that figure untouched.
    expect(
      configured.gemini.calculateUsage(
        request,
        result({ promptTokens: 5, completionTokens: 43, totalTokens: 48 }),
      ),
    ).toEqual({ requestTokens: 5, responseTokens: 43, totalTokens: 48 });
  });
});
