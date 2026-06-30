import { defineConfig, devices } from '@playwright/test';

// Browser end-to-end tests for JanaShakti.
//
// The entry/auth specs (e2e/entry.spec.js) are NON-DESTRUCTIVE — they run the real app in
// a real browser via the Vite dev server, with no Firebase writes and no Gemini calls, so
// they're safe to run repeatedly / in CI. The authenticated guest journey
// (e2e/journey.spec.js) is opt-in via E2E_AUTH=1 because it hits LIVE Firebase; point the
// app at the Firebase Emulator (or a throwaway test project) before enabling it broadly.
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 412, height: 915 }, // mobile-first PWA
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
