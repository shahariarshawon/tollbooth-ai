import type { Account, TestContext } from './support/context';
import {
  bearer,
  createTestContext,
  destroyTestContext,
  http,
  registerTenant,
} from './support/context';

/**
 * Phase 11: alerts are written directly by the gateway (apps/gateway/src/alerts), not through any
 * control-plane endpoint, so the fixture rows here are inserted with Prisma, the same way Phase 10's
 * analytics fixtures are.
 */
describe('Alerts (e2e)', () => {
  let ctx: TestContext;
  let tenantA: Account & { tenantId: string };
  let tenantB: Account & { tenantId: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    tenantA = await registerTenant(ctx, 'alerts-a');
    tenantB = await registerTenant(ctx, 'alerts-b');

    await ctx.prisma.alert.create({
      data: {
        tenantId: tenantA.tenantId,
        type: 'BUDGET_LIMIT',
        message: 'Monthly budget reached',
        severity: 'CRITICAL',
      },
    });
    await ctx.prisma.alert.create({
      data: {
        tenantId: tenantA.tenantId,
        type: 'PROVIDER_ERROR',
        message: 'Gemini timed out',
        severity: 'WARNING',
      },
    });
    await ctx.prisma.alert.create({
      data: {
        tenantId: tenantB.tenantId,
        type: 'SECURITY_ALERT',
        message: 'Blocked a request',
        severity: 'CRITICAL',
      },
    });
  });

  afterAll(async () => {
    if (!ctx) return;
    // Alerts cascade-delete with their tenant (unlike ai_requests/ledger_entries), so no manual cleanup
    // is needed before destroyTestContext removes tenantA and tenantB.
    await destroyTestContext(ctx);
  });

  it('alert created: lists what was seeded for this tenant, newest first', async () => {
    const res = await http(ctx).get('/alerts').set(bearer(tenantA)).expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.data.map((a: { type: string }) => a.type)).toEqual([
      'PROVIDER_ERROR',
      'BUDGET_LIMIT',
    ]);
  });

  it('tenant isolation: tenant B never sees tenant A alerts, and vice versa', async () => {
    const resA = await http(ctx).get('/alerts').set(bearer(tenantA)).expect(200);
    expect(resA.body.data.every((a: { type: string }) => a.type !== 'SECURITY_ALERT')).toBe(true);

    const resB = await http(ctx).get('/alerts').set(bearer(tenantB)).expect(200);
    expect(resB.body.total).toBe(1);
    expect(resB.body.data[0].type).toBe('SECURITY_ALERT');
  });

  it('GET /alerts/unread returns only unread alerts', async () => {
    const res = await http(ctx).get('/alerts/unread').set(bearer(tenantA)).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((a: { status: string }) => a.status === 'UNREAD')).toBe(true);
  });

  it('mark as read works: PATCH flips status and sets readAt, and it leaves /unread', async () => {
    const before = await http(ctx).get('/alerts').set(bearer(tenantA)).expect(200);
    const target = before.body.data.find((a: { type: string }) => a.type === 'BUDGET_LIMIT');

    const res = await http(ctx).patch(`/alerts/${target.id}/read`).set(bearer(tenantA)).expect(200);
    expect(res.body).toMatchObject({ id: target.id, status: 'READ' });
    expect(res.body.readAt).not.toBeNull();

    const unread = await http(ctx).get('/alerts/unread').set(bearer(tenantA)).expect(200);
    expect(unread.body.find((a: { id: string }) => a.id === target.id)).toBeUndefined();
    expect(unread.body).toHaveLength(1);
  });

  it('marking an already-read alert again is a no-op, not an error', async () => {
    const list = await http(ctx).get('/alerts').set(bearer(tenantA)).expect(200);
    const read = list.body.data.find((a: { status: string }) => a.status === 'READ');

    await http(ctx).patch(`/alerts/${read.id}/read`).set(bearer(tenantA)).expect(200);
  });

  it('cannot mark another tenant alert as read: 404, not a cross-tenant leak', async () => {
    const resB = await http(ctx).get('/alerts').set(bearer(tenantB)).expect(200);
    const otherTenantsAlertId: string = resB.body.data[0].id;

    await http(ctx).patch(`/alerts/${otherTenantsAlertId}/read`).set(bearer(tenantA)).expect(404);
  });

  it('rejects an unauthenticated request', async () => {
    await http(ctx).get('/alerts').expect(401);
  });

  it('existing features still work: health check and a plain authenticated route', async () => {
    await http(ctx).get('/health').expect(200);
    await http(ctx).get(`/tenants/${tenantA.tenantId}`).set(bearer(tenantA)).expect(200);
  });
});
