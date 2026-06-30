import { test, expect } from '@playwright/test';
import admin from 'firebase-admin';

// Deterministic lifecycle E2E against the Firebase Emulator (auth + firestore). Run via
// `npm run test:e2e:emulator` — `firebase emulators:exec` boots the emulator and exports
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST, so the Admin SDK below auto-targets
// the emulator (no credentials), and the dev server is launched pointed at it
// (VITE_FIREBASE_EMULATOR=1). Nothing touches the production project or AI quota.
//
// PREREQUISITE: the Firestore emulator requires JDK 21+ (firebase-tools ≥ 14). Install a
// JDK 21 (e.g. Eclipse Temurin 21) and ensure `java -version` reports 21+ before running.

const PROJECT_ID = 'janashakti-9ded8';
const SEED_ID = 'e2e-seeded-issue';

test.beforeAll(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  await admin.firestore().collection('issues').doc(SEED_ID).set({
    issueType: 'Pothole',
    severity: 'High',
    description: 'E2E seeded pothole on the test road',
    status: 'Reported',
    locationText: 'MG Road, Bangalore',
    city: 'Bangalore',
    location: { lat: 12.9716, lng: 77.5946 },
    userName: 'Seed Reporter',
    confirmations: 0,
    confirmedBy: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

const uniqueEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@janashakti.test`;

test('email signup on the emulator creates an account and enters onboarding', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Email' }).click();
  await page.getByPlaceholder('Email').fill(uniqueEmail());
  await page.getByPlaceholder('Password').fill('Test123!pw');
  await page.getByRole('button', { name: 'Create Account' }).click();

  // First-run accounts route to onboarding → proves emulator Auth signup + the emulator
  // Firestore profile write + the onboarding redirect work end-to-end.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 25_000 });
});

test('an emulator-seeded issue round-trips into the app UI', async ({ page }) => {
  await page.goto(`/issue/${SEED_ID}`);
  await expect(page.getByText('E2E seeded pothole on the test road')).toBeVisible({ timeout: 15_000 });
});
