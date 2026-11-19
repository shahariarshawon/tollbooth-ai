import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER } from './test-helpers';

test.describe('Error Handling & Edge Cases', () => {
  test('gracefully handles 404 for unknown route', async ({ page }) => {
    await page.goto('/some-nonexistent-route-404');
    await expect(page.getByText(/404|not found/i)).toBeVisible();
  });

  test('displays user-friendly error boundary on upstream service failure', async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);

    // Force control plane overview to fail with 502
    await page.route('**/api/cp/dashboard/overview*', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'The service is unavailable right now' }),
      });
    });

    await page.goto('/dashboard');

    // Page layout should remain intact, error message displayed
    await expect(page.getByText(/unavailable|failed|error/i)).toBeVisible();

    // Verify raw stack traces are not leaked
    const content = await page.content();
    expect(content).not.toContain('node_modules');
    expect(content).not.toContain('at async');
  });
});
