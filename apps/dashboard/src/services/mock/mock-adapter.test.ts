import { apiKeyService } from '../api-key.service';
import { projectService } from '../project.service';

/** Guards the contract the real endpoints must keep: a key secret is returned once, never stored. */
describe('API key service (mock adapter)', () => {
  it('returns the full secret only on creation and never in the list', async () => {
    const project = (await projectService.list()).find((p) => p.status === 'ACTIVE');
    const issued = await apiKeyService.create({
      name: 'Test key',
      projectId: project!.id,
      permissions: ['chat:completions'],
    });

    expect(issued.secret).toMatch(/^tb_live_[0-9a-f]{40}$/);
    expect(issued.apiKey.keyPrefix).toBe(issued.secret.slice(0, 14));

    const listed = await apiKeyService.list();
    expect(JSON.stringify(listed)).not.toContain(issued.secret);
    expect(listed.find((key) => key.id === issued.apiKey.id)).not.toHaveProperty('secret');
  });

  it('rotation issues a different secret and revocation is final', async () => {
    const [first] = (await apiKeyService.list()).filter((key) => key.status === 'ACTIVE');
    const rotated = await apiKeyService.rotate(first!.id);
    expect(rotated.secret).toMatch(/^tb_live_/);
    expect(rotated.apiKey.keyPrefix).not.toBe(first!.keyPrefix);

    const revoked = await apiKeyService.revoke(first!.id);
    expect(revoked.status).toBe('REVOKED');
    await expect(apiKeyService.rotate(first!.id)).rejects.toMatchObject({ status: 409 });
  });

  it('reports validation and missing-resource errors as ApiError', async () => {
    await expect(
      apiKeyService.create({ name: '', projectId: 'p-support', permissions: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(apiKeyService.revoke('does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});
