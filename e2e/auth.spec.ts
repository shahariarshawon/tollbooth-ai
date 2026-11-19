import { test, expect } from '@playwright/test';
import { setupAuthenticatedContext, SYNTHETIC_USER } from './test-helpers';

test.describe('Authentication & Session Flow', () => {
  test('redirects unauthenticated visitor from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('validates required fields on empty submit', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    await submitBtn.click();

    // Check for validation alerts
    await expect(page.getByRole('alert').filter({ hasText: /email is required/i })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: /password is required/i }),
    ).toBeVisible();
  });

  test('displays error message on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid credentials' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test('signs in successfully and redirects to dashboard', async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);
    await page.context().clearCookies();

    await page.route('**/api/auth/login', async (route) => {
      await page.context().addCookies([
        {
          name: 'tb_user',
          value: encodeURIComponent(JSON.stringify(SYNTHETIC_USER)),
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
        {
          name: 'tb_at',
          value: 'synthetic_access_token',
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: SYNTHETIC_USER }),
      });
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(SYNTHETIC_USER.email!);
    await page.getByLabel(/password/i).fill('SecureTestPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Tollbooth AI')).toBeVisible();
  });

  test('signs out cleanly via user menu and redirects to login', async ({ page }) => {
    await setupAuthenticatedContext(page, SYNTHETIC_USER);

    await page.route('**/api/auth/logout', async (route) => {
      await page.context().clearCookies();
      await route.fulfill({ status: 204 });
    });

    await page.goto('/dashboard');
    await expect(page.getByText('Tollbooth AI')).toBeVisible();

    // Open user menu
    const userBtn = page.getByRole('button', { name: /open user menu/i });
    await expect(userBtn).toBeVisible();
    await userBtn.click();

    const signOutOption = page.getByRole('menuitem', { name: /sign out/i });
    await expect(signOutOption).toBeVisible();
    await signOutOption.click();

    await expect(page).toHaveURL(/\/login/);
  });
});
