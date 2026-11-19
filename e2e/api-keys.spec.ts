import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER } from './test-helpers';

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);
  });

  test('renders API keys table with key prefixes and masks secrets', async ({ page }) => {
    await page.goto('/dashboard/api-keys');

    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible();

    // Verify key names and prefixes are visible
    await expect(page.getByText('Production Gateway Key')).toBeVisible();
    await expect(page.getByText('tb_live_prod')).toBeVisible();
    await expect(page.getByText('Staging Integration Key')).toBeVisible();
    await expect(page.getByText('tb_live_stg')).toBeVisible();

    // Verify raw secret is NOT present in page source
    const content = await page.content();
    expect(content).not.toContain('tb_sec_');
    expect(content).not.toContain('super_secret_raw_key');
  });

  test('opens create key modal for authorized admin', async ({ page }) => {
    await page.goto('/dashboard/api-keys');

    const createBtn = page.getByRole('button', { name: /create key/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });
});
