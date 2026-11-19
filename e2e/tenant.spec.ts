import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER } from './test-helpers';

test.describe('Tenant Switching & Isolation', () => {
  test('enforces tenant isolation for regular tenant administrator', async ({ page }) => {
    // Normal tenant administrator
    await setupAuthenticatedContext(page, SYNTHETIC_USER);
    await page.goto('/dashboard');

    // TenantScopePicker should not be visible for non-super-admin
    const tenantPicker = page.getByRole('combobox', { name: /working tenant/i });
    await expect(tenantPicker).not.toBeVisible();
  });

  test('allows super administrator to view and switch tenant scope', async ({ page }) => {
    // Super administrator context
    await setupAuthenticatedContext(page, {
      userId: 'usr_super_admin',
      email: 'root@tollbooth.test',
      role: 'SUPER_ADMIN',
      tenantId: 'tnt_platform_root',
      tenantName: 'Platform Root',
    });

    await page.route('**/api/cp/tenants*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'tnt_acme', companyName: 'Acme Corporation', slug: 'acme', status: 'ACTIVE' },
            { id: 'tnt_stark', companyName: 'Stark Industries', slug: 'stark', status: 'ACTIVE' },
          ],
          total: 2,
          page: 1,
          limit: 100,
        }),
      });
    });

    await page.goto('/dashboard');

    // TenantScopePicker should be visible for super admin
    const tenantPicker = page.getByRole('combobox', { name: /working tenant/i }).first();
    await expect(tenantPicker).toBeVisible();

    // Select different tenant
    await tenantPicker.selectOption({ label: 'Acme Corporation' });
    await expect(tenantPicker).toHaveValue('tnt_acme');
  });
});
