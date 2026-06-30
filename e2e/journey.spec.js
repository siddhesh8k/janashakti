import { test, expect } from '@playwright/test';

// Authenticated guest journey — hits LIVE Firebase (anonymous auth writes a guest user +
// profile doc). DISABLED by default so the suite never pollutes the production project.
// Enable with `E2E_AUTH=1 npx playwright test e2e/journey.spec.js`, and ideally point the
// app at the Firebase Emulator / a throwaway test project first. This is the scaffold for
// full report-lifecycle E2E (sign-in → report → verify → resolve), which needs seeded,
// emulated data to be deterministic and non-destructive.
const RUN = process.env.E2E_AUTH === '1';

test.describe('Guest journey — LIVE Firebase (opt-in)', () => {
  test.skip(!RUN, 'Opt-in: set E2E_AUTH=1 (writes a guest user — prefer the Firebase Emulator)');

  test('guest sign-in reaches the signed-in app and the key screens render', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue as Guest' }).click();

    // Signed in → the auth options are gone and the app shell is mounted.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.screenshot({ path: 'e2e/.artifacts/01-after-login.png', fullPage: true });

    // Secondary routes render (these don't trigger the home→onboarding redirect).
    await page.goto('/map');
    await expect(page).toHaveURL(/\/map/);
    await page.screenshot({ path: 'e2e/.artifacts/02-map.png', fullPage: true });

    await page.goto('/agents');
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByText(/AI Intelligence/i).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: 'e2e/.artifacts/03-agents.png', fullPage: true });

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
    await page.screenshot({ path: 'e2e/.artifacts/04-profile.png', fullPage: true });
  });
});
