import { test, expect } from '@playwright/test';

// Non-destructive E2E: the unauthenticated entry experience. Drives the REAL app in a
// real browser end-to-end (dev server) without touching Firebase data or Gemini quota.
// Proves the app boots, the PWA shell is wired, and the auth UI works.

test.describe('Entry & auth screen', () => {
  test('loads the app shell with the correct title + PWA manifest/theme', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status() ?? 200).toBeLessThan(400);
    await expect(page).toHaveTitle(/JanaShakti — People's Power/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#04091a');
  });

  test('renders the auth screen: logo, brand, Hindi tagline, all three sign-in options', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'JanaShakti' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'JanaShakti' })).toBeVisible();
    await expect(page.getByText(/जनशक्ति/)).toBeVisible(); // People's Power tagline
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue as Guest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Email' })).toBeVisible();
  });

  test('email form toggles open with email + password inputs and both actions', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in with Email' }).click();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('loads without any uncaught page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'JanaShakti' })).toBeVisible();
    await page.waitForTimeout(1500); // let async hooks settle (Firebase listeners fail-soft, not throw)
    expect(errors, `Uncaught page errors:\n${errors.join('\n')}`).toHaveLength(0);
  });
});
