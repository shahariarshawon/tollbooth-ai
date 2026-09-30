import type { PrismaService } from '@tollbooth/database';
import type { GatewayException } from '../common/errors/gateway.exception';
import { ApiKeyService } from './api-key.service';

function build(row: unknown) {
  const prisma = {
    apiKey: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return { service: new ApiKeyService(prisma as unknown as PrismaService), prisma };
}

const RAW = 'tb_live_0123456789abcdef0123456789abcdef';
const activeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1',
  tenantId: 't1',
  projectId: 'p1',
  permissions: ['chat:completions'],
  rateLimit: null,
  status: 'ACTIVE',
  expiresAt: null,
  lastUsedAt: new Date(),
  tenant: { status: 'ACTIVE', plan: 'STARTUP' },
  project: { status: 'ACTIVE' },
  ...overrides,
});

describe('ApiKeyService', () => {
  it('hashes with SHA-256 hex, deterministically', () => {
    expect(ApiKeyService.hash(RAW)).toMatch(/^[0-9a-f]{64}$/);
    expect(ApiKeyService.hash(RAW)).toBe(ApiKeyService.hash(RAW));
    expect(ApiKeyService.hash(RAW)).not.toBe(ApiKeyService.hash(`${RAW}x`));
    expect(ApiKeyService.hash(RAW)).not.toContain(RAW);
  });

  it('looks the key up by its hash, never by the raw value', async () => {
    const { service, prisma } = build(activeRow());
    await service.authenticate(RAW);

    const where = prisma.apiKey.findUnique.mock.calls[0]?.[0].where;
    expect(where).toEqual({ keyHash: ApiKeyService.hash(RAW) });
    expect(JSON.stringify(prisma.apiKey.findUnique.mock.calls)).not.toContain(RAW);
  });

  it('returns the caller identity for a valid key', async () => {
    const { service } = build(activeRow({ rateLimit: 60 }));
    await expect(service.authenticate(RAW)).resolves.toEqual({
      apiKeyId: 'k1',
      tenantId: 't1',
      projectId: 'p1',
      plan: 'STARTUP',
      permissions: ['chat:completions'],
      rateLimit: 60,
    });
  });

  it.each([
    '',
    'tb_',
    'sk-abcdefghijklmnopqrstuvwxyz',
    'tb_short',
    `tb_${'a'.repeat(300)}`,
    'tb_has space inside it',
  ])('rejects the malformed key %j without touching the database', async (key) => {
    const { service, prisma } = build(activeRow());
    const error = (await service
      .authenticate(key)
      .catch((e: GatewayException) => e)) as GatewayException;
    expect(error.getStatus()).toBe(401);
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['revoked', activeRow({ status: 'REVOKED' })],
    ['expired', activeRow({ expiresAt: new Date(Date.now() - 1000) })],
  ])('gives the same 401 for a %s key', async (_label, row) => {
    const { service } = build(row);
    const error = (await service
      .authenticate(RAW)
      .catch((e: GatewayException) => e)) as GatewayException;
    expect(error.getStatus()).toBe(401);
    expect(error.payload.code).toBe('invalid_api_key');
  });

  it('refuses keys of inactive tenants and projects with 403', async () => {
    for (const row of [
      activeRow({ tenant: { status: 'SUSPENDED' } }),
      activeRow({ project: { status: 'ARCHIVED' } }),
    ]) {
      const error = (await build(row)
        .service.authenticate(RAW)
        .catch((e: GatewayException) => e)) as GatewayException;
      expect(error.getStatus()).toBe(403);
    }
  });

  it('only rewrites lastUsedAt when it is stale', async () => {
    const fresh = build(activeRow({ lastUsedAt: new Date() }));
    await fresh.service.authenticate(RAW);
    expect(fresh.prisma.apiKey.update).not.toHaveBeenCalled();

    const stale = build(activeRow({ lastUsedAt: new Date(Date.now() - 3_600_000) }));
    await stale.service.authenticate(RAW);
    expect(stale.prisma.apiKey.update).toHaveBeenCalledTimes(1);

    const never = build(activeRow({ lastUsedAt: null }));
    await never.service.authenticate(RAW);
    expect(never.prisma.apiKey.update).toHaveBeenCalledTimes(1);
  });

  it('does not fail authentication when the lastUsedAt write fails', async () => {
    const { service, prisma } = build(activeRow({ lastUsedAt: null }));
    prisma.apiKey.update.mockRejectedValue(new Error('db down'));
    await expect(service.authenticate(RAW)).resolves.toMatchObject({ apiKeyId: 'k1' });
  });
});
