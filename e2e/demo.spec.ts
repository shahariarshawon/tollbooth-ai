import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_DEMO_USER } from './test-helpers';

test.describe('Public Read-Only Demo Journey', () => {
  test('renders demo workspace entry landing page', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: /demo workspace/i })).toBeVisible();
    await expect(page.getByText(/back to the home page/i)).toBeVisible();
  });

  test('enters demo mode and verifies read-only restrictions and demo banner', async ({ page }) => {
    // Set up authenticated context with a demo user session
    await setupAuthenticatedContext(page, SYNTHETIC_DEMO_USER);

    await page.goto('/dashboard');

    // 1. Verify Demo Banner is prominently displayed with read-only explanation
    const banner = page.getByRole('status').filter({ hasText: /demo workspace/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Read-only, with generated sample data');
    await expect(banner.getByRole('button', { name: /exit demo/i })).toBeVisible();

    // 2. Navigate to API Keys page in demo mode
    await page.goto('/dashboard/api-keys');
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible();

    // 3. Verify that write actions (e.g., "Create key" button) are hidden/disabled in demo mode
    const createKeyBtn = page.getByRole('button', { name: /create key/i });
    await expect(createKeyBtn).not.toBeVisible();

    // 4. Verify synthetic sample keys are rendered in read-only mode
    await expect(page.getByText('Production Gateway Key')).toBeVisible();
    await expect(page.getByText('tb_live_prod')).toBeVisible();
  });

  test('exits demo mode via demo banner and redirects to login', async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_DEMO_USER);

    await page.route('**/api/auth/logout', async (route) => {
      await page.context().clearCookies();
      await route.fulfill({ status: 204 });
    });

    await page.goto('/dashboard');
    const exitDemoBtn = page.getByRole('button', { name: /exit demo/i });
    await expect(exitDemoBtn).toBeVisible();
    await exitDemoBtn.click();

    await expect(page).toHaveURL(/\/login/);
  });
});
