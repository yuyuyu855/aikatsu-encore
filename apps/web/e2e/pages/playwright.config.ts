import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  outputDir: '../../../../test-results/pages',
  use: {
    baseURL: 'http://127.0.0.1:4173/aikatsu-encore/',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
  },
  webServer: {
    command: 'pnpm preview:pages',
    url: 'http://127.0.0.1:4173/aikatsu-encore/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
