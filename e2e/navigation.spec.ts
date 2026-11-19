import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER } from './test-helpers';

test.describe('Dashboard Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);
  });

  test('renders all primary sidebar navigation links and navigates', async ({ page }) => {
    await page.goto('/dashboard');

    // Sidebar navigation items
    const navItems = [
      {
        name: 'Analytics',
        path: '/dashboard/analytics',
        indicator: /live telemetry|total requests/i,
      },
      { name: 'API Keys', path: '/dashboard/api-keys', indicator: /api keys/i },
      { name: 'Billing', path: '/dashboard/billing', indicator: /usage & budget controls/i },
      { name: 'Audit Logs', path: '/dashboard/audit-logs', indicator: /audit logs/i },
      { name: 'Settings', path: '/dashboard/settings', indicator: /settings/i },
    ];

    for (const item of navItems) {
      const link = page.getByRole('link', { name: item.name }).first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(new RegExp(item.path));
      await expect(page.getByText(item.indicator).first()).toBeVisible();
    }
  });

  test('supports mobile drawer navigation on narrow viewports', async ({ page }) => {
    // Set viewport to mobile phone width
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    // Desktop sidebar should be hidden on mobile
    const menuBtn = page.getByRole('button', { name: /open navigation/i });
    await expect(menuBtn).toBeVisible();

    // Open mobile navigation drawer
    await menuBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click API Keys from inside drawer
    const drawerApiKeyLink = page.getByRole('dialog').getByRole('link', { name: 'API Keys' });
    await expect(drawerApiKeyLink).toBeVisible();
    await drawerApiKeyLink.click();

    await expect(page).toHaveURL(/\/dashboard\/api-keys/);
    await expect(page.getByRole('heading', { name: /api keys/i })).toBeVisible();
  });
});
