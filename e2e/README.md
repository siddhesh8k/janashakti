# End-to-end tests (Playwright)

Browser E2E for JanaShakti. Two tiers:

## 1. Entry / auth smoke — `npm run test:e2e`
Non-destructive. Launches the Vite dev server and drives the real app in Chromium:
- app shell + title + PWA manifest/theme
- auth screen (logo, brand, Hindi tagline, all 3 sign-in options)
- email-form toggle (inputs + actions)
- zero uncaught page errors on load

No Firebase writes, no Gemini calls — safe to run anytime / in CI. Spec: [`entry.spec.js`](entry.spec.js).

## 2. Deterministic lifecycle — `npm run test:e2e:emulator`
Runs against the **Firebase Emulator Suite** (auth + firestore) so it's fully deterministic
and never touches the production project or AI quota. `firebase emulators:exec` boots the
emulator, seeds an issue via the Admin SDK, then Playwright runs the dev server pointed at
the emulator (`VITE_FIREBASE_EMULATOR=1`, Gemini disabled) and exercises:
- email signup → first-run onboarding redirect (Auth + Firestore profile write)
- an Admin-seeded issue rendering in the app (data round-trip)

Spec: [`lifecycle.spec.js`](lifecycle.spec.js) · config: [`../playwright.emulator.config.js`](../playwright.emulator.config.js).

**Prerequisite:** the Firestore emulator needs **JDK 21+** (firebase-tools ≥ 14). Verify with
`java -version`. (CI/dev machines on JDK 17 will see *"firebase-tools no longer supports Java
version before 21"* — install Temurin 21 and retry.)

## 3. Authenticated journey (live Firebase) — opt-in
`E2E_AUTH=1 npx playwright test e2e/journey.spec.js` — guest sign-in tour against the **live**
project (creates one anonymous guest). Skipped by default; prefer the emulator lifecycle
above for repeatable runs. Spec: [`journey.spec.js`](journey.spec.js).

## Extending to full report → verify → resolve
The lifecycle spec is the scaffold. The next step is driving the report-create flow (manual
fallback form + a fixture image via `setInputFiles`), then community verify (mock geolocation
with `context.grantPermissions(['geolocation'])` + `context.setGeolocation(...)` inside the
500 m geofence), then authority resolve — all against the emulator with seeded data.
