import type { PrismaService } from '@tollbooth/database';
import type { GatewayException } from '../common/errors/gateway.exception';
import type { AIProvider } from './provider.interface';
import { ProviderService } from './provider.service';

type Row = {
  modelName: string;
  isActive: boolean;
  inputTokenPrice: string;
  outputTokenPrice: string;
  provider: { id: string; type: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE'; status: 'ACTIVE' | 'DISABLED' };
};

const row = (
  overrides: Omit<Partial<Row>, 'provider'> & { provider?: Partial<Row['provider']> } = {},
): Row => ({
  modelName: 'gpt-4',
  isActive: true,
  inputTokenPrice: '30',
  outputTokenPrice: '60',
  ...overrides,
  provider: { id: 'p1', type: 'OPENAI', status: 'ACTIVE', ...overrides.provider },
});

const openai = (configured = true): AIProvider => ({
  type: 'OPENAI',
  isConfigured: () => configured,
  chatCompletion: jest.fn(),
});

function build(rows: Row[], providers: AIProvider[]) {
  const prisma = { aiModel: { findMany: jest.fn().mockResolvedValue(rows) } };
  return new ProviderService(prisma as unknown as PrismaService, providers);
}

async function failure(promise: Promise<unknown>): Promise<GatewayException> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: GatewayException) => error,
  );
}

describe('ProviderService.resolve', () => {
  it('returns the provider and prices for an active model', async () => {
    const provider = openai();
    const resolved = await build([row()], [provider]).resolve('gpt-4');

    expect(resolved.provider).toBe(provider);
    expect(resolved.providerType).toBe('OPENAI');
    expect(resolved.name).toBe('gpt-4');
    expect(String(resolved.prices.input)).toBe('30');
  });

  it('rejects an unknown model with 400 model_not_found', async () => {
    const error = await failure(build([], [openai()]).resolve('nope'));
    expect(error.getStatus()).toBe(400);
    expect(error.payload.code).toBe('model_not_found');
  });

  it('rejects an inactive model with 400 model_unavailable', async () => {
    const error = await failure(build([row({ isActive: false })], [openai()]).resolve('gpt-4'));
    expect(error.getStatus()).toBe(400);
    expect(error.payload.code).toBe('model_unavailable');
  });

  it.each([
    ['the provider is disabled', [row({ provider: { status: 'DISABLED' } })], [openai()]],
    ['the provider is not configured', [row()], [openai(false)]],
    [
      'no implementation exists for the provider',
      [row({ provider: { type: 'ANTHROPIC' } })],
      [openai()],
    ],
  ])('answers 503 when %s', async (_label, rows, providers) => {
    const error = await failure(build(rows, providers).resolve('gpt-4'));
    expect(error.getStatus()).toBe(503);
    expect(error.payload.code).toBe('provider_unavailable');
  });

  it('skips a candidate that cannot be served and uses the next one', async () => {
    const provider = openai();
    const resolved = await build(
      [row({ provider: { id: 'a', type: 'ANTHROPIC' } }), row({ provider: { id: 'b' } })],
      [provider],
    ).resolve('gpt-4');
    expect(resolved.provider).toBe(provider);
  });
});
