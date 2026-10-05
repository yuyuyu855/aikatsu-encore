import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';

export default defineConfig({
  testDir: './apps/web/e2e',
  testIgnore: '**/pages/**',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(systemChromium) ? { executablePath: systemChromium } : {},
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
