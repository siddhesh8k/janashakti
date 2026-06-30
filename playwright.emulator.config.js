import { defineConfig, devices } from '@playwright/test';

// E2E against the Firebase Emulator Suite. Invoked by `npm run test:e2e:emulator`, which
// wraps this config in `firebase emulators:exec --only auth,firestore` — so the emulator is
// already running and FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are exported to
// this process (used by the Admin-SDK seed in lifecycle.spec.js). This config only launches
// the dev server, pointed at the emulator (VITE_FIREBASE_EMULATOR=1) with Gemini disabled so
// the run is fully deterministic and never touches the production project or AI quota.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/lifecycle.spec.js',
  outputDir: './e2e/.artifacts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 412, height: 915 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_EMULATOR: '1',
      VITE_GEMINI_API_KEY: '', // belt-and-suspenders: keep AI out of the deterministic run
    },
  },
});
