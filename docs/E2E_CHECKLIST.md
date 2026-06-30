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
3. [ ] Open the issue → **Authority view**. *Enable Authority Mode* unlocks only once you've earned the **Civic Authority** badge (100 civic points) — then mark **Resolved** with a photo.
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
- [ ] `/agents` shows the **ESG summary card** + 7 agent cards (incl. **Agent 6 — ESG Impact Scorer** and **Agent 7 — Resolution Coordinator**) and **"ESG Scored"** + **"Coordinated"** live stats.
- [ ] The pipeline flow diagram ends `… → Resolved → ESG Score → SDG Tagged`.

## 3b. Autonomous Resolution Coordinator (Agent 7)
- [ ] On an **owned, unresolved** issue (`IssueDetail`, below AI Prediction) the **Run AI Coordinator** button appears and is hidden once Resolved.
- [ ] Running it streams a **live reasoning trace** (each step: action name + reasoning + observation), ending with a summary; a re-run is possible.
- [ ] On a **stalled/overdue** issue it actually **escalates** (tier bumps, n8n fires) and/or **drafts an RTI** (Copy RTI draft works) — and feeds each result into the next decision.
- [ ] On an issue **already at the top escalation tier**, escalate **no-ops** and the agent **pivots** to a different action (self-correction visible in the trace).
- [ ] As an **enrolled authority** (civicScore ≥ 100), the **AI Coordinator** action on `AuthorityDashboard` runs the same loop with **no permission error**.
- [ ] A new `agent_runs` trace (kind `coordinator`) appears in **Recent Pipeline Runs**, and the issue gains a `coordination` field.

## 4. Map & community (`MapScreen`, `IssueDetail`)
- [ ] Map shows severity-coloured markers; adopted-zone overlay renders (if any).
- [ ] **Verify** an issue from within **500 m** (real GPS) → **+5** civic score, one vote/user.
- [ ] Verifying from outside 500 m is blocked with a clear message.
- [ ] At **5 confirmations** (consent ≠ none) the social post fires once.

## 5. Authority powers (earned) → Resolution → ESG
- [ ] **Below 100 civic points:** Authority view shows a **locked "Civic Authority"** card with a progress bar — no Verify/Resolve buttons (and Firestore rules block enrolling).
- [ ] **At ≥ 100 points:** the **Civic Authority** badge unlocks → *Enable Authority Mode* works → Verify / In Progress / Resolve buttons appear.
- [ ] Authority actions award the acting user points (**+5** advance status, **+15** resolve).
- [ ] Authority resolve with a fix photo → **Agent 5** verification badge (AI-verified / flagged).
- [ ] ESG toasts appear (calculating → score).
- [ ] **IssueDetail** shows the **ESG Score card** (E/S/G scores, impact lines, metrics), **SDG alignment pills**, and an **"ESG Report"** share button → modal → *Share Impact* (Web Share / clipboard).
- [ ] Confetti + **+25** reporter reward on the live Resolved transition.
- [ ] **Recurrence:** after an issue is Resolved, report the **same type at the same spot** again → the new issue shows the orange **"Recurring issue — the earlier fix did not hold"** banner (taps through to the prior complaint), and the authority email includes a **RECURRENCE NOTICE** citing the earlier Complaint ID. (Detected within a 1-year window.)

## 6. Profile ESG (`ProfileScreen`)
- [ ] **ESG Impact** section shows Water Saved / Waste Addressed / People Impacted + contributed-SDG pills.
- [ ] **ESG badges** render; resolving enough issues unlocks Green Guardian / SDG Contributor; filing an RTI unlocks Justice Seeker; reporting 3 Water Leakage unlocks Water Warrior.
- [ ] Existing **10 badges** (incl. **Civic Authority**) + 5 ESG badges + levels + streak still display.

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
- [ ] **iOS Safari** — after a few seconds a tappable **"Add JanaShakti to your Home Screen — Tap to see how"** banner appears; tapping it opens a step-by-step guide (Share → Add to Home Screen → Add). Following it launches the app **full-screen/standalone**.
- [ ] **iOS non-Safari** (Chrome/Firefox/in-app webview) — the banner still appears; its guide tells the user to **open the page in Safari first** (install is Safari-only on iOS).
- [ ] Dismissing the iOS banner/guide is remembered (doesn't reappear on reload).

## 10. Resilience
- [ ] With n8n webhooks unset/down, the app still works (fire-and-forget, never blocks).
- [ ] An AI/Gemini failure shows a fallback, never a crash (ErrorBoundary).
- [ ] Offline revisit serves cached reads (Firestore `persistentLocalCache`).

## 11. Civic collaboration layer (open an issue → Join / contribute / verify)
- [ ] **Join Issue** (a 2nd account, not the reporter) → pick a civic role → contributor count +1, a "joined" event appears in the **Activity** timeline, reputation **+5**.
- [ ] **Add evidence** (photo) → AI relevance check runs → on accept, it appears in the timeline + the **Evidence gallery** + reputation **+15** (irrelevant images save but award nothing); cap **5/issue**.
- [ ] **Post an update** (text composer) → appears in the **Activity** timeline + reputation **+10**.
- [ ] **Mark as resolved** (contributor or reporter) → status flips to **Needs Verification** (purple) + a "resolution requested" timeline event.
- [ ] **Community verification** appears → vote **Yes/Partial/No**. Gated: must be **within 500 m** (live GPS) and, if you joined, **24h after joining**. At **3 votes & ≥70% positive** → **Resolved** (or reopens). *Demo tip: vote from accounts that did NOT join (the 24h gate only applies to contributors), or use the existing **authority resolve** path.*
- [ ] On a **Resolved** issue, an **active contributor** (who joined + posted) opening it gets **+25** once (claim-on-view); the reporter still gets **+25**.
- [ ] **Lead moderation** (reporter / Civic-Authority): close/reopen joining + remove a contributor (× on their row).
- [ ] **Refresh prediction** (owner, on the AI Prediction card) re-runs Agent 4 with live contributor/evidence/activity signals.
- [ ] **Profile** shows **Community Reputation** + Joined / Evidence / Verify-Votes tiles + new badges (Neighborhood Hero, Road Guardian, Evidence Expert, Community Builder, Top Verifier).
- [ ] **Contributor notifications** (the joining account's bell): after the owner/authority advances the joined issue, the **bell shows unread** and `/notifications` lists *"A {type} you joined is now In Progress"*, *"…needs your verification"*, and on resolve *"…resolved — open to claim +25"* (tapping it opens the issue and auto-claims). A 2nd contributor posting evidence/an update produces an **activity** notification; being **removed** produces a *"You were removed…"* notification. Reporter-side notifications are unchanged.
- [ ] Existing features intact: representatives, authority resolve, ESG, escalation, leaderboard.

---

## Notes
- Demo data: 8 resolved ESG-scored issues are seeded (`seedTag: 'esg-demo'`, avg City ESG ≈ A), so the ESG dashboards are populated even before you resolve a fresh one.
- Cross-account caveat: ESG **badge counters** for the reporter only increment when the resolver is the reporter (Firestore rules forbid cross-user writes). A single-account demo (report → self-enroll as authority → resolve) exercises the full path including badge unlocks.
- Automated equivalent: `npm test` (deterministic, incl. `src/agents/esgScorer.test.js`) and `npm run test:report` (full suite + branded report under `tests/reports/latest.html`).

*JanaShakti — जनशक्ति — People's Power · Vibe2Ship 2026 · PS2 Community Hero*
