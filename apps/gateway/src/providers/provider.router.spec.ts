import type { PrismaService } from '@tollbooth/database';
import type { GatewayException } from '../common/errors/gateway.exception';
import { setLogSink } from '../common/logging/structured-logger';
import type { AppConfig } from '../config/config.module';
import type { AIProvider, ProviderId } from './provider.interface';
import { ProviderRouter, tierOf } from './provider.router';

type ProviderRow = {
  id: string;
  type: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE';
  status: 'ACTIVE' | 'DISABLED';
  configuration: unknown;
};
type Row = {
  modelName: string;
  isActive: boolean;
  inputTokenPrice: string;
  outputTokenPrice: string;
  provider: ProviderRow;
};

const providerRow = (
  type: ProviderRow['type'],
  overrides: Partial<ProviderRow> = {},
): ProviderRow => ({
  id: type.toLowerCase(),
  type,
  status: 'ACTIVE',
  configuration: {},
  ...overrides,
});

const row = (overrides: Omit<Partial<Row>, 'provider'> & { provider?: ProviderRow } = {}): Row => ({
  modelName: 'gemini-2.0-flash',
  isActive: true,
  inputTokenPrice: '0.10',
  outputTokenPrice: '0.40',
  provider: providerRow('GOOGLE'),
  ...overrides,
});

const fakeProvider = (id: ProviderId, type: AIProvider['type'], configured = true): AIProvider => ({
  id,
  type,
  isConfigured: () => configured,
  getProviderName: () => id,
  chatCompletion: jest.fn(),
  streamCompletion: jest.fn(),
  getModelInfo: (model) => ({ name: model, contextWindow: 1000, maxOutputTokens: 100 }),
  validateModel: () => true,
  calculateUsage: jest.fn(),
});

const gemini = (configured = true) => fakeProvider('gemini', 'GOOGLE', configured);
const openai = () => fakeProvider('openai', 'OPENAI');
const anthropic = () => fakeProvider('anthropic', 'ANTHROPIC');

function build(rows: Row[], providers: AIProvider[], defaultProvider: ProviderId = 'gemini') {
  const prisma = { aiModel: { findMany: jest.fn().mockResolvedValue(rows) } };
  return new ProviderRouter(prisma as unknown as PrismaService, providers, {
    GATEWAY_DEFAULT_PROVIDER: defaultProvider,
  } as AppConfig);
}

async function failure(promise: Promise<unknown>): Promise<GatewayException> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: GatewayException) => error,
  );
}

describe('ProviderRouter', () => {
  describe('routing to Gemini, the active provider', () => {
    it('returns the Gemini provider, its id, prices and model info', async () => {
      const provider = gemini();
      const resolved = await build([row()], [provider, openai(), anthropic()]).resolve(
        'gemini-2.0-flash',
      );

      expect(resolved.provider).toBe(provider);
      expect(resolved.providerId).toBe('gemini');
      expect(resolved.providerType).toBe('GOOGLE');
      expect(resolved.name).toBe('gemini-2.0-flash');
      expect(String(resolved.prices.input)).toBe('0.10');
      expect(String(resolved.prices.output)).toBe('0.40');
      expect(resolved.info).toEqual({
        name: 'gemini-2.0-flash',
        contextWindow: 1000,
        maxOutputTokens: 100,
      });
    });

    it('reads the pricing tier from the provider configuration', async () => {
      const free = row({ provider: providerRow('GOOGLE', { configuration: { tier: 'free' } }) });
      const paid = row({ provider: providerRow('GOOGLE', { configuration: { tier: 'paid' } }) });
      const none = row();
      expect((await build([free], [gemini()]).resolve('gemini-2.0-flash')).prices.tier).toBe(
        'free',
      );
      expect((await build([paid], [gemini()]).resolve('gemini-2.0-flash')).prices.tier).toBe(
        'paid',
      );
      expect((await build([none], [gemini()]).resolve('gemini-2.0-flash')).prices.tier).toBe(
        'paid',
      );
    });
  });

  describe('errors', () => {
    it('rejects an unknown model with 400 model_not_found', async () => {
      const error = await failure(build([], [gemini()]).resolve('nope'));
      expect(error.getStatus()).toBe(400);
      expect(error.payload.code).toBe('model_not_found');
    });

    it('rejects an inactive model with 400 model_unavailable', async () => {
      const error = await failure(build([row({ isActive: false })], [gemini()]).resolve('x'));
      expect(error.getStatus()).toBe(400);
      expect(error.payload.code).toBe('model_unavailable');
    });

    it.each([
      [
        'the provider is disabled in the database (OpenAI and Anthropic by default)',
        [row({ modelName: 'gpt-4', provider: providerRow('OPENAI', { status: 'DISABLED' }) })],
        [gemini(), openai(), anthropic()],
      ],
      ['the provider has no API key', [row()], [gemini(false)]],
      [
        'no implementation is registered for the provider',
        [row({ provider: providerRow('ANTHROPIC') })],
        [gemini()],
      ],
    ])('answers 503 when %s', async (_label, rows, providers) => {
      const error = await failure(build(rows, providers).resolve('gpt-4'));
      expect(error.getStatus()).toBe(503);
      expect(error.payload.code).toBe('provider_unavailable');
    });
  });

  describe('when more than one active provider offers a model', () => {
    const shared = (type: ProviderRow['type']) =>
      row({ modelName: 'shared-model', provider: providerRow(type) });
    // OpenAI comes first in catalogue order, which must not matter.
    const rows = [shared('OPENAI'), shared('GOOGLE'), shared('ANTHROPIC')];
    const all = [gemini(), openai(), anthropic()];

    it('prefers the default provider, Gemini', async () => {
      expect((await build(rows, all).resolve('shared-model')).providerId).toBe('gemini');
    });

    it('follows GATEWAY_DEFAULT_PROVIDER when it is changed', async () => {
      expect((await build(rows, all, 'openai').resolve('shared-model')).providerId).toBe('openai');
      expect((await build(rows, all, 'anthropic').resolve('shared-model')).providerId).toBe(
        'anthropic',
      );
    });

    it('falls back to another provider when the default cannot serve', async () => {
      const resolved = await build(rows, [gemini(false), openai(), anthropic()]).resolve(
        'shared-model',
      );
      expect(resolved.providerId).toBe('openai');
    });
  });

  describe('startup', () => {
    afterEach(() => setLogSink(null));

    it('warns when the default provider has no API key, but does not fail', () => {
      const lines: string[] = [];
      setLogSink((line) => lines.push(line));
      expect(() => build([], [gemini(false)]).onModuleInit()).not.toThrow();
      expect(JSON.parse(lines[0]!)).toMatchObject({
        event: 'default_provider_not_configured',
        level: 'warn',
        provider: 'gemini',
      });
    });

    it('says nothing when the default provider is configured', () => {
      const lines: string[] = [];
      setLogSink((line) => lines.push(line));
      build([], [gemini()]).onModuleInit();
      expect(lines).toHaveLength(0);
    });
  });
});

describe('tierOf', () => {
  it.each([
    [{ tier: 'free' }, 'free'],
    [{ tier: 'paid' }, 'paid'],
    [{ tier: 'unknown' }, 'paid'],
    [{}, 'paid'],
    [null, 'paid'],
    [['free'], 'paid'],
    ['free', 'paid'],
  ])('reads %j as %s', (configuration, expected) => {
    expect(tierOf(configuration as never)).toBe(expected);
  });
});
