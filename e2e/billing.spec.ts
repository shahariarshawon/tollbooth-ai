import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER, SYNTHETIC_DEMO_USER } from './test-helpers';

test.describe('Budget Management & Billing Controls', () => {
  test('renders current plan tier and budget limits for admin', async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);
    await page.goto('/dashboard/billing');

    await expect(page.getByRole('heading', { name: /usage & budget controls/i })).toBeVisible();

    // Check Plan Details
    await expect(page.getByText('Scale Pro')).toBeVisible();

    // Check Budget limits
    await expect(page.getByText(/\$200/).first()).toBeVisible();
    await expect(page.getByText(/\$54\.20/).first()).toBeVisible();
  });

  test('displays synthetic workspace warning in demo mode and disables modifications', async ({
    page,
  }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_DEMO_USER);
    await page.goto('/dashboard/billing');

    // Verify synthetic demo warning banner
    await expect(page.getByText(/synthetic demo workspace/i)).toBeVisible();
    await expect(
      page.getByText(/plan changes and limit modifications are disabled/i),
    ).toBeVisible();

    // Verify modify buttons are not offered
    const changePlanBtn = page.getByRole('button', { name: /change plan|upgrade/i });
    await expect(changePlanBtn).not.toBeVisible();
  });
});
