import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || 3002;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node apps/dashboard/.next/standalone/apps/dashboard/server.js',
    url: BASE_URL,
    env: {
      PORT: `${PORT}`,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
