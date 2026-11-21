import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3200',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:3200/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
