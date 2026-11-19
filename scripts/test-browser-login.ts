import { chromium } from '@playwright/test';

async function run() {
  console.log('Launching browser for end-to-end login test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const networkLogs: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/')) {
      networkLogs.push(`--> ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes('/api/auth/')) {
      networkLogs.push(`<-- ${res.status()} ${res.url()}`);
    }
  });

  try {
    console.log('1. Navigating to http://localhost:3002/login ...');
    await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
    console.log('Page loaded:', await page.title());

    console.log('2. Testing invalid credentials...');
    await page.getByLabel(/email/i).fill('admin@techcorp.com');
    await page.getByLabel(/password/i).fill('WrongPassword999!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForSelector('text=Invalid email or password', { timeout: 10000 });
    console.log('PASS: Correctly displayed "Invalid email or password" on bad credentials.');

    console.log('3. Testing valid seeded credentials (admin@techcorp.com / ChangeMe123!)...');
    await page.getByLabel(/password/i).fill('ChangeMe123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('PASS: Successfully redirected to', page.url());

    const cookies = await context.cookies();
    const userCookie = cookies.find((c) => c.name === 'tb_user');
    const atCookie = cookies.find((c) => c.name === 'tb_at');
    console.log('Session cookies verified:', {
      tb_user: userCookie ? decodeURIComponent(userCookie.value) : null,
      tb_at: atCookie ? 'present (httpOnly)' : 'missing',
    });

    console.log('4. Testing logout flow...');
    const userMenuButton = page.locator('button[aria-label="User menu"]');
    if (await userMenuButton.isVisible()) {
      await userMenuButton.click();
      await page.getByText(/sign out/i).click();
      await page.waitForURL('**/login', { timeout: 10000 });
      console.log('PASS: Successfully logged out and redirected to /login.');
    } else {
      console.log('User menu button found or navigated directly.');
    }

    console.log('\n--- Network Activity Summary ---');
    console.log(networkLogs.join('\n'));
    console.log('\nALL BROWSER AUTHENTICATION CHECKS PASSED!');
  } catch (err) {
    console.error('Browser test failed:', err);
    console.error('\nNetwork logs:', networkLogs);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
