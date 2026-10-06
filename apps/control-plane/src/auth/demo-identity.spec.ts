import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_TENANT_SLUG, DEMO_USER_EMAIL, UNUSABLE_PASSWORD_HASH } from '@tollbooth/shared';

/**
 * prisma/seed/demo.ts runs in an image that has no workspace packages, so it keeps its own copy of the
 * demo identity. This fails if that copy and packages/shared/src/demo.ts ever differ, which would leave
 * the control plane looking for a demo user the seed never created.
 */
describe('demo identity', () => {
  const seed = readFileSync(join(__dirname, '../../../../prisma/seed/demo.ts'), 'utf8');
  const constant = (name: string): string | undefined =>
    new RegExp(`const ${name} = '([^']*)';`).exec(seed)?.[1];

  it('is the same in the seed and in the shared package', () => {
    expect(constant('DEMO_TENANT_SLUG')).toBe(DEMO_TENANT_SLUG);
    expect(constant('DEMO_USER_EMAIL')).toBe(DEMO_USER_EMAIL);
    expect(constant('UNUSABLE_PASSWORD_HASH')).toBe(UNUSABLE_PASSWORD_HASH);
  });
});
