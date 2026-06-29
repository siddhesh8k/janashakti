# JanaShakti — End-to-End Test & Demo Checklist

> **जनशक्ति — People's Power** · manual happy-path walkthrough for the live app.
> Live: **https://janashakti-9ded8.web.app** · Use a real phone for GPS + PWA install steps.

Automated coverage (run with `npm test`) is deterministic and green, but it can't drive a
real browser/Firebase/Gemini session. This checklist is the **human end-to-end pass** —
run it before any demo or submission. Tick each box; note the expected result.

---

## ⚡ 5-minute smoke test (the critical happy path)

1. [ ] **Open** the live URL → sign in (Google / Guest).
2. [ ] **Report** an issue (photo or manual) → submit → the **agent pipeline overlay** runs (Analyzer → Detector → Router → Predictor) → lands on the issue/map.
3. [ ] Open the issue → **Authority view** → *Enable Authority Mode* → mark **Resolved** with a photo.
4. [ ] Watch the **"✅ Resolved! ESG impact being calculated…"** toast, then **"🌿 ESG Score: X/10"**.
5. [ ] Reopen the issue → the **ESG Score card** (E/S/G + SDG pills) is shown.
6. [ ] **Analytics → ESG tab** shows the City ESG grade + Top Environmental Impact.

If all six pass, the core loop is healthy. Full coverage below.

---

## 1. Auth (`HomeScreen`)
- [ ] **Google sign-in** works (popup); first-time users land in **Onboarding** (3-step affiliation).
- [ ] **Guest** (anonymous) sign-in works.
- [ ] **Email** sign-up + sign-in works.
- [ ] Sign out (Profile) returns to the auth screen; earned score/badges persist on re-login.

## 2. Report (`ReportScreen`)
- [ ] **Photo capture** → Gemini Vision returns type, severity, description, department, complaint, legal right.
- [ ] **AI guard rail** — a non-civic photo (selfie/food) is rejected with a polite reason.
- [ ] **Manual fallback** form appears if AI fails (or chosen manually).
- [ ] Submit → a **Complaint ID** (`JS-CITY-YEAR-####`) is shown; GPS address is captured + editable.
- [ ] Submit credits **+10** civic score and increments `issuesByType` for that type.

## 3. Agent pipeline (`AgentPipelineOverlay` + `AgentsShowcase`)
- [ ] Overlay streams a live trace: **Analyzer → Detector → Router → Predictor**, each "done".
- [ ] `/agents` shows the **ESG summary card** + 6 agent cards (incl. **Agent 6 — ESG Impact Scorer**) and an **"ESG Scored"** live stat.
- [ ] The pipeline flow diagram ends `… → Resolved → ESG Score → SDG Tagged`.

## 4. Map & community (`MapScreen`, `IssueDetail`)
- [ ] Map shows severity-coloured markers; adopted-zone overlay renders (if any).
- [ ] **Verify** an issue from within **500 m** (real GPS) → **+5** civic score, one vote/user.
- [ ] Verifying from outside 500 m is blocked with a clear message.
- [ ] At **5 confirmations** (consent ≠ none) the social post fires once.

## 5. Resolution → ESG (the new flow)
- [ ] Authority resolve with a fix photo → **Agent 5** verification badge (AI-verified / flagged).
- [ ] ESG toasts appear (calculating → score).
- [ ] **IssueDetail** shows the **ESG Score card** (E/S/G scores, impact lines, metrics), **SDG alignment pills**, and an **"ESG Report"** share button → modal → *Share Impact* (Web Share / clipboard).
- [ ] Confetti + **+25** reporter reward on the live Resolved transition.

## 6. Profile ESG (`ProfileScreen`)
- [ ] **ESG Impact** section shows Water Saved / Waste Addressed / People Impacted + contributed-SDG pills.
- [ ] **ESG badges** render; resolving enough issues unlocks Green Guardian / SDG Contributor; filing an RTI unlocks Justice Seeker; reporting 3 Water Leakage unlocks Water Warrior.
- [ ] Existing 9 badges + levels + streak still display.

## 7. Analytics ESG tab (`AnalyticsDashboard`)
- [ ] **Overview** tab unchanged (charts, AI insights, Wall of Shame).
- [ ] **ESG** tab: City ESG **grade card** (colored), **SDG Contributions** bars, **City ESG Rankings** (5 sample cities), **Top Environmental Impact** (real resolved+scored issues).
- [ ] HomeScreen **City ESG chip** appears (≥5 resolved) → tapping it opens Analytics already on the **ESG** tab.

## 8. Other features (regression)
- [ ] **RTI** generation works (and increments `rtiFiled`).
- [ ] **Share** links open (X / WhatsApp / LinkedIn / Facebook / Telegram).
- [ ] **Escalation** chain card shows on unresolved issues; aged issues climb tiers.
- [ ] **Journalist** dashboard: story-ready filter + AI press release.
- [ ] **Leaderboard**: Citizens / Companies / Colleges / Representatives tabs.
- [ ] **Voice assistant**: ask "issues near me?" → grounded spoken answer (EN/HI).
- [ ] **Excel export** on Analytics/Authority/Leaderboard/Journalist (anonymized).

## 9. PWA install
- [ ] **Android Chrome / desktop Chrome** — after ~30s an **Install** banner appears; installs the app.
- [ ] **iOS Safari** — after a few seconds a **"tap Share → Add to Home Screen"** hint appears (no Install button — expected). Adding to Home Screen launches the app **full-screen/standalone**. *(Chrome/Firefox on iOS won't show the hint — by design.)*
- [ ] Dismissing the iOS hint is remembered (doesn't reappear on reload).

## 10. Resilience
- [ ] With n8n webhooks unset/down, the app still works (fire-and-forget, never blocks).
- [ ] An AI/Gemini failure shows a fallback, never a crash (ErrorBoundary).
- [ ] Offline revisit serves cached reads (Firestore `persistentLocalCache`).

---

## Notes
- Demo data: 8 resolved ESG-scored issues are seeded (`seedTag: 'esg-demo'`, avg City ESG ≈ A), so the ESG dashboards are populated even before you resolve a fresh one.
- Cross-account caveat: ESG **badge counters** for the reporter only increment when the resolver is the reporter (Firestore rules forbid cross-user writes). A single-account demo (report → self-enroll as authority → resolve) exercises the full path including badge unlocks.
- Automated equivalent: `npm test` (deterministic, incl. `src/agents/esgScorer.test.js`) and `npm run test:report` (full suite + branded report under `tests/reports/latest.html`).

*JanaShakti — जनशक्ति — People's Power · Vibe2Ship 2026 · PS2 Community Hero*
