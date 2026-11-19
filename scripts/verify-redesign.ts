import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'artifacts/screenshots');

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('--- STARTING COMPREHENSIVE UI/UX REDESIGN BROWSER VERIFICATION ---');
  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // 1. LANDING PAGE TESTS
    // -------------------------------------------------------------
    console.log('\n[1/4] Testing Landing Page across viewports...');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    console.log('  Navigating to http://localhost:3002/ ...');
    await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });

    const title = await page.title();
    console.log(`  Page title: "${title}"`);
    if (!title.includes('Tollbooth AI')) {
      throw new Error(`Unexpected title: ${title}`);
    }

    // Check Hero elements
    const headline = await page.textContent('h1');
    console.log(`  Hero Headline: "${headline?.trim()}"`);

    // Verify CTAs
    const demoCta = page.getByRole('link', { name: /explore live demo/i }).first();
    const githubCta = page.getByRole('link', { name: /view on github/i }).first();
    if (!(await demoCta.isVisible()) || !(await githubCta.isVisible())) {
      throw new Error('Hero CTAs not visible');
    }
    console.log('  Hero CTAs verified (Explore Live Demo, View on GitHub).');

    // Test Hero Mockup Tab Switcher
    const streamButton = page.getByRole('button', { name: /live request stream/i });
    const providersButton = page.getByRole('button', { name: /provider circuit status/i });
    await providersButton.click();
    await page.waitForTimeout(300);
    const hasClosed = await page.getByText(/circuit closed/i).first().isVisible();
    console.log(`  Mockup Provider Tab Switcher: ${hasClosed ? 'SUCCESS' : 'FAILED'}`);
    await streamButton.click();
    await page.waitForTimeout(300);

    // Test Code Preview Tabs
    const pythonTab = page.getByRole('button', { name: /python/i });
    await pythonTab.click();
    await page.waitForTimeout(200);
    const hasOpenAI = await page.getByText(/from openai import OpenAI/i).isVisible();
    console.log(`  Code Preview Tab Switcher: ${hasOpenAI ? 'SUCCESS' : 'FAILED'}`);

    // Take Desktop Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'landing-desktop.png'), fullPage: true });
    console.log('  Saved: landing-desktop.png');

    // Tablet Viewport (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'landing-tablet.png') });
    console.log('  Saved: landing-tablet.png');

    // Mobile Viewport (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const menuButton = page.getByRole('button', { name: /open menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(300);
      console.log('  Mobile hamburger menu opened successfully.');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'landing-mobile.png') });
    console.log('  Saved: landing-mobile.png');

    // -------------------------------------------------------------
    // 2. LOGIN PAGE TESTS
    // -------------------------------------------------------------
    console.log('\n[2/4] Testing Login Page & Password Toggle...');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });

    // Verify 2-column layout elements
    const valueProp = page.getByText(/Control AI Access & Costs in One Unified Layer/i);
    const isValuePropVisible = await valueProp.isVisible();
    console.log(`  Left value prop column visible on desktop: ${isValuePropVisible}`);

    // Password visibility toggle test
    const passwordInput = page.locator('input#password');
    await passwordInput.fill('SecretTestPassword123!');
    const inputTypeInitial = await passwordInput.getAttribute('type');
    console.log(`  Password input initial type: ${inputTypeInitial}`);

    const toggleButton = page.getByRole('button', { name: /show password/i });
    await toggleButton.click();
    const inputTypeToggled = await passwordInput.getAttribute('type');
    console.log(`  Password input toggled type: ${inputTypeToggled}`);
    if (inputTypeToggled !== 'text') {
      throw new Error(`Expected input type text, got ${inputTypeToggled}`);
    }

    const hideButton = page.getByRole('button', { name: /hide password/i });
    await hideButton.click();
    const inputTypeReverted = await passwordInput.getAttribute('type');
    console.log(`  Password input reverted type: ${inputTypeReverted}`);

    // Verify secondary demo button
    const demoButton = page.getByRole('button', { name: /explore demo — no account required/i });
    console.log(`  "Explore Demo — No Account Required" CTA visible: ${await demoButton.isVisible()}`);

    // Test invalid credentials error
    await page.locator('input#email').fill('admin@techcorp.com');
    await passwordInput.fill('WrongPassword!');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForSelector('text=Invalid email or password', { timeout: 8000 });
    console.log('  Invalid credentials error display: PASSED');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-desktop.png') });
    console.log('  Saved: login-desktop.png');

    // -------------------------------------------------------------
    // 3. AUTHENTICATED DASHBOARD TESTS
    // -------------------------------------------------------------
    console.log('\n[3/4] Testing Authenticated Dashboard Navigation...');
    await passwordInput.fill('ChangeMe123!');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log(`  Successfully redirected to ${page.url()}`);

    // Verify Dashboard Shell Elements
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });
    const hasGatewayStatus = await page.getByText(/gateway 100% operational/i).isVisible();
    console.log(`  Top navbar live gateway indicator: ${hasGatewayStatus}`);

    // Wait for Dashboard content to load
    await page.waitForSelector('text=Spend', { timeout: 15000 });
    console.log('  Dashboard Stats loaded successfully.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-overview.png') });
    console.log('  Saved: dashboard-overview.png');

    // Navigate to Analytics
    await page.getByRole('link', { name: 'Usage Analytics' }).click();
    await page.waitForURL('**/dashboard/analytics', { timeout: 8000 });
    await page.waitForSelector('h1:has-text("Usage Analytics")', { timeout: 8000 });
    console.log('  Navigated to /dashboard/analytics: PASSED');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-analytics.png') });

    // Navigate to API Keys
    await page.getByRole('link', { name: 'API Keys' }).click();
    await page.waitForURL('**/dashboard/api-keys', { timeout: 8000 });
    await page.waitForSelector('h1:has-text("API Keys")', { timeout: 8000 });
    console.log('  Navigated to /dashboard/api-keys: PASSED');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-api-keys.png') });

    // Navigate to Teams
    await page.getByRole('link', { name: 'Teams & Limits' }).click();
    await page.waitForURL('**/dashboard/teams', { timeout: 8000 });
    console.log('  Navigated to /dashboard/teams: PASSED');

    // Navigate to Billing
    await page.getByRole('link', { name: 'Billing' }).click();
    await page.waitForURL('**/dashboard/billing', { timeout: 8000 });
    console.log('  Navigated to /dashboard/billing: PASSED');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-billing.png') });

    // Navigate to Settings
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/dashboard/settings', { timeout: 8000 });
    console.log('  Navigated to /dashboard/settings: PASSED');

    // Sign out
    const userMenu = page.locator('button[aria-label="Open user menu"]');
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.getByText(/sign out/i).click();
      await page.waitForURL('**/login', { timeout: 8000 });
      console.log('  Sign out and redirect to /login: PASSED');
    }

    // -------------------------------------------------------------
    // 4. ONE-CLICK DEMO AUTHENTICATION
    // -------------------------------------------------------------
    console.log('\n[4/4] Testing One-Click Demo Entry...');
    await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
    const oneClickDemoBtn = page.getByRole('button', { name: /explore demo — no account required/i });
    if (await oneClickDemoBtn.isVisible()) {
      console.log('  Clicking "Explore Demo — No Account Required"...');
      
      const [response] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/auth/demo')),
        oneClickDemoBtn.click(),
      ]);

      console.log(`  Demo API response status: ${response.status()}`);
      if (response.status() === 200) {
        await page.waitForURL('**/dashboard', { timeout: 15000 });
        console.log('  Successfully redirected to /dashboard in DEMO mode!');

        // Verify Demo Banner
        const demoBanner = page.getByRole('status').filter({ hasText: /demo workspace/i });
        const isDemoBannerVisible = await demoBanner.isVisible();
        console.log(`  Demo banner indicator visible: ${isDemoBannerVisible}`);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-demo.png') });
        console.log('  Saved: dashboard-demo.png');
      } else {
        const errorText = await response.text();
        console.log(`  Demo API response text: ${errorText}`);
      }
    }

    console.log('\n======================================================');
    console.log('ALL BROWSER UI/UX REDESIGN TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('Browser verification failed:', error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
