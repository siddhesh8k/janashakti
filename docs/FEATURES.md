# JanaShakti — Features

> **जनशक्ति — People's Power**
> A field guide to every feature shipped in JanaShakti, written for the Vibe2Ship 2026 judging panel (PS2 — Community Hero).

This document catalogues **what JanaShakti does**, **why each feature matters**, and **how it works** — drawn directly from the source (`src/`). Every claim below maps to real code, not a roadmap.

---

## 2.1 App Identity

**JanaShakti** (जनशक्ति — *People's Power*) is a mobile-first, installable **Progressive Web App** that turns a single photo of a civic problem — a pothole, an overflowing bin, a dead streetlight — into a fully-formed, AI-analysed, authority-routed, community-verifiable complaint with a legal paper trail and an automatic escalation clock. It closes the loop that every Indian civic-complaint app leaves open: **after you report, nothing happens**. JanaShakti answers that with a 5-agent Gemini pipeline that classifies and drafts the complaint, an automation layer (n8n) that emails the right department and posts to social media, a time-based escalation engine that climbs from Ward Officer → Department Head → Commissioner → Media, and a transparency layer that ranks elected representatives by their actual resolution rate. Once an issue is **Resolved**, a 6th Gemini agent scores its real-world **ESG (Environmental / Social / Governance)** impact and maps it to the UN **Sustainable Development Goals (SDGs)**. It is built **end-to-end on Google's stack** — Gemini, Firebase, Google Maps — with **no custom backend**.

**Target users**

| User | What JanaShakti gives them |
|---|---|
| **Indian citizens** | One-tap reporting, legal empowerment (RTI/complaint letters), civic gamification, a voice assistant |
| **Municipal authorities** | A triaged, AI-prioritised work queue with resolution-proof verification |
| **Companies (CSR)** | Adopt a zone near the office, auto-tag issues, generate AI CSR reports + LinkedIn posts |
| **Colleges** | Campus civic programs, inter-college competition, civic-duty hour tracking potential |
| **Journalists** | A filtered feed of story-ready, evidence-backed civic failures + AI press releases + 48h exclusives |

---

## 2.2 Core Features

### AI-Powered Reporting

- **Gemini Vision analysis** — On photo capture, `agents/issueAnalyzer.js` sends the (compressed) image to Gemini via **native function-calling** (`report_civic_issue` typed schema), returning issue type, severity, a 2-sentence description, the responsible department, a ready-to-submit complaint letter, the relevant **citizen legal right**, predicted resolution days, and a genuineness verdict. *Why it matters:* a citizen with no idea which department owns a problem gets a filed, correctly-classified complaint in seconds. *How:* `callGeminiVisionFunction()` with a prompt-based JSON fallback (`callGeminiVision`) on any failure.
- **AI guard rail** — The analyzer runs a relevance check *first*: selfies, food, screenshots, memes, indoor scenes → `is_genuine: false`, confidence < 40, with a polite citizen-facing reason. *Why:* keeps the civic feed clean and prevents spam/abuse. *How:* enforced in the prompt and again at write time (`isReportBlocked`).
- **Self-correcting analysis** — If the first pass is genuine-but-uncertain (confidence < `RETRY_THRESHOLD` = 55), the agent re-examines the image once with a self-critique prompt and keeps the more confident result. *Why:* recovers good reports from blurry/odd-angle photos. *How:* `runAttempt()` twice; the `retried` flag surfaces in the live pipeline trace.
- **Manual fallback** — If Gemini is unavailable, the analyzer throws and `ReportScreen` shows a manual form (type / severity / description) so a report is **never lost**. *Why:* graceful degradation; an AI outage can't break civic reporting.
- **Complaint ID generation** — Every report gets a human reference like `JS-BLR-2026-00042` (`utils/complaintId.js`): `JS-{cityCode}-{year}-{sequence}`. *Why:* a citizen-friendly tracking number for follow-ups and RTI references.
- **GPS auto-location + reverse geocoding** — A single app-wide geolocation watch (`LocationProvider`) captures coordinates; **Google Geocoding API** (`utils/geocode.js`) converts them to a human address, editable before submit. *Why:* accurate, low-friction location without typing.
- **Photo + short video reports** — Photos are compressed to inline base64 (< 900 KB, kept under Firestore's 1 MiB doc limit); short (≤ 10 s) videos upload to **Cloudinary** (unsigned preset) with only the URL stored. *Why:* fully free-tier (Firebase Spark) friendly — no paid Cloud Storage.

### 4-Agent Intelligence Pipeline

Orchestrated by `agents/orchestrator.js` (`orchestrateIssue`), each agent's output is **passed into the next** — Agent 3's routed department feeds Agent 4's prediction — and every step streams a live reasoning trace to the on-screen `AgentPipelineOverlay`.

| Agent | File | Model mode | Produces |
|---|---|---|---|
| **1 · Issue Analyzer** | `issueAnalyzer.js` | Gemini Vision + function-calling | type, severity, description, department, complaint, legal right, confidence, genuineness |
| **2 · Duplicate & Recurrence Detector** | `duplicateDetector.js` | Firestore geo-query + Gemini text | `isDuplicate` (geo ±0.002° ≈ 200 m + similarity > 65%); `checkRecurrence` flags a **resolved** issue that recurs at the same spot within **365 days** → the new report links the prior complaint and the authority email carries a "RECURRENCE NOTICE" |
| **3 · Authority Router** | `authorityRouter.js` | Gemini text + n8n | department, officer title, email subject, urgency, SLA hours, escalation path |
| **4 · Resolution Predictor** | `resolutionPredictor.js` | Gemini text | priority score, predicted days, escalation risk, recommendation, factors |
| **5 · Resolution Verifier** | `resolutionVerifier.js` | Gemini Vision | is the fix photo genuine & resolved? (flags, never blocks) |
| **6 · ESG Impact Scorer** | `esgScorer.js` | Gemini text | post-resolution ESG score across E/S/G + UN SDG mapping |

> **Note:** Agent 6 runs at **resolution time** — fired when an issue is marked Resolved — not in the photo-submit pipeline orchestrated above.

- **Agent pipeline logging** — Every agent call writes to the `agents_log` collection via `logAgent()` (input, output, latency, success, `geminiModel`), and each full run writes a step trace to `agent_runs`. *Why:* total transparency — the **Agents Showcase** screen renders live traces, and `useAgents` aggregates success counts. *How:* `addDoc` with `serverTimestamp()`.
- **Model fallback chain** — All AI routes through `fetchAI()` in `utils/gemini.js`, which falls through `gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash` on any 404/429/503. *Why:* rate-limit resilience — a quota spike on one model silently rolls to the next instead of failing the submit.

### Community Pressure System

- **Pressure Meter** — `components/PressureMeter.jsx` renders a confirmation-threshold bar (+10 `pressureScore` per confirmation). *Why:* makes collective demand visible and motivating. 
- **Community verification** — Any signed-in citizen within **500 m** (Haversine geofence) can confirm an issue, earning **+5 civic score**. One vote per user (`confirmedBy[]`), executed in a Firestore **transaction** (`utils/confirmIssue.js`). *Why:* geofencing + one-vote-per-user prevents remote vote-stuffing.
- **Auto-post at threshold** — When confirmations reach **5** (`POST_THRESHOLD`) and consent ≠ `none`, the confirm transaction sets a `socialQueued` flag and fires the `social_post` n8n webhook **exactly once**. *Why:* community-verified issues get amplified automatically, with no double-posting race.
- **Wall of Shame** — Issues open ≥ **30 days** are flagged `wallOfShame: true`, surfaced with a red banner and pushed to the Journalist Dashboard. *Why:* sustained, visible accountability for ignored problems.

### Automated Accountability

- **Auto-escalation engine** — `utils/escalation.js` (`checkAndEscalate`, run on every issue view) climbs `ESCALATION_LEVELS` by age: **Ward Officer (day 0) → Department Head (7d) → Commissioner Office (14d) → Media & Public Alert (30d)**. *Why:* a complaint that's ignored doesn't go stale — it climbs the chain automatically. *How:* `levelForDays()` compares days-open to trigger days, updates `escalationLevel`, and fires the `escalation` webhook.
- **Escalation chain display** — `getEscalationInfo()` powers an IssueDetail card showing current authority, days open, days-until-next-escalation, and the next authority, colour-coded green → orange → red → dark-red.
- **n8n authority email** — Agent 3 fires the `authority_email` webhook with the full complaint payload (department, subject, description, location, reporter, complaint text, deep link). *Why:* the right department actually receives a formal email — the missing link in most civic apps. *How:* HTTP Request node (per CLAUDE.md n8n rules).
- **SLA tracking** — Every department in `constants/departments.js` carries an `slaHours` value (24–168h by category), surfaced on the routed issue. *Why:* sets a measurable expectation per department.

### Legal Empowerment

- **AI-generated RTI applications** — `utils/rti.js` (`buildRTIApplication`) composes a formally-correct **Right to Information Act, 2005** application — proper PIO addressing, Section 6(1)/6(3)/7 citations, fee clause, 30-day mandate — with Gemini tailoring *only* the list of information points to the issue type (deterministic fallback `DEFAULT_RTI_POINTS`). *Why:* hands citizens a real legal instrument, not a vague "complain harder." *How:* structure is fixed; identity/location/reference fields bind to live issue data so there are no unfilled placeholders.
- **Formal complaint letters** — `buildComplaintLetter` composes a submit-ready 3-paragraph complaint from the AI body + reporter identity. *Why:* every report ships with a printable, official complaint.
- **Legal rights display** — Each issue surfaces the relevant `legalRight` (a citizen right under Indian law) returned by Agent 1. *Why:* civic literacy in context.

### Social Amplification

- **Share links** — `utils/social.js` (`getShareLinks`) builds intent URLs for **X/Twitter, WhatsApp, LinkedIn, Facebook, Telegram**, each deep-linking to the issue page with a pre-written message. *Why:* one tap turns a citizen's network into pressure.
- **Social consent model** — Per-issue `socialConsent` is `tag` (post + mention the user's `@handle`) / `anonymous` (post, no mention) / `none` (never post). *Why:* user control and privacy by design.
- **Platform-only posting** — Auto-posts originate **only** from `@JanaShaktiApp` accounts via n8n — **never** user accounts, **no user OAuth ever**. *Why:* protects users and centralises accountability.
- **AI social captions** — `generateXCaption()` drafts an under-260-char tweet tagging relevant civic handles with `#JanaShakti` + a city hashtag.

### Resolution & Celebration

- **Authority dashboard** — `screens/AuthorityDashboard.jsx` lets qualified citizens filter by department, advance status, and upload resolution proof. *Why:* gives the supply side a real workflow. JanaShakti has **no separate authority persona** — authority powers are **earned** through gamification: the new **Civic Authority** badge unlocks at `AUTHORITY_THRESHOLD` = **100 civic points** (`constants/issueTypes.js`), so only genuine, trusted citizens can act as an authority. Enforcement is real, not cosmetic — `firestore.rules` requires the user's `civicScore` ≥ 100 (checked via `get()` on their user doc) to create an `/authorities` record, so a user can't self-enroll (and can't write status/resolution fields) until they've earned the badge. The dashboard shows a **LOCKED** card with a progress bar to 100 below the threshold, and a *"Civic Authority unlocked → Enable Authority Mode"* card once earned; the **Verify status / In Progress / Resolve** action buttons appear only for enrolled, qualified users. Authority actions feed a virtuous cycle by awarding civic points back to the authority — **+5** to advance a status (`AUTHORITY_ACTION`), **+15** to resolve with a verified photo (`AUTHORITY_RESOLVE`). *Distinction:* this gates the **authority status-pipeline** actions — separate from the community **confirm/verify** action (any geofenced citizen, **+5**), which is unchanged crowd verification.
- **Resolution photo + AI verification** — On a fix photo, **Agent 5** (`verifyResolution`) judges whether it genuinely shows *this* issue resolved, writing `resolutionVerified / resolutionConfidence / resolutionNote`. It **flags, never blocks** — a legitimate resolution can't be broken by an AI hiccup. *Why:* prevents fake "fixed" photos while staying robust.
- **Before/After slider** — `components/BeforeAfterSlider.jsx` shows the original vs. fix photo with an "AI-verified · NN%" badge.
- **Confetti celebration** — When `IssueDetail`'s real-time listener sees status flip to **Resolved**, `components/ResolutionCelebration.jsx` fires a confetti animation and awards the reporter **+25 civic score** (idempotent via `resolutionCelebrated`). *Why:* closing the loop should *feel* like a win.

---

## 2.3 Unique Differentiators

Features no other civic platform has shipped together.

### Corporate Civic Adoption

- Companies **adopt a geographic zone** near their office (set via `AffiliationPicker` in Onboarding/Profile, stored on `users.affiliation`).
- Every issue a member reports is **auto-tagged** `adoptedBy {id, name, type}` (`ReportScreen`).
- **Zone circle overlays** render on the Google Map (tricolor `Circle` with an animated Ashoka Chakra).
- **AI-generated CSR reports** — `utils/csrReport.js` (`generateCSRReport`) returns a monthly report: executive summary, numbered highlights, `impactScore`, `resolutionRate`, top issue type, recommendation, and a ready **LinkedIn post**. Stats are computed **live** from the `issues` collection (`utils/orgStats.js`, `getCountFromServer`) — never stored counters.
- **Civic Champion badge** on the organisation document.

*Why it matters:* turns CSR from a glossy PDF into measurable, real-world civic impact a company can publish.

### College Civic Adoption

- The same adoption mechanics for **educational institutions** (org `type: college`).
- **Inter-college competition** via the Leaderboard's Colleges tab.
- **Civic Campus badge**; NSS / civic-duty-hour tracking potential.

*Why it matters:* mobilises the most energetic civic demographic — students — with a competitive hook.

### Journalist Dashboard

- **Story-ready filtering** — `screens/JournalistDashboard.jsx` loads the **100 oldest unresolved** issues (oldest = most newsworthy) and filters to story-ready via `utils/story.js` (`isStoryReady`): an issue qualifies on **≥ 3 of 6 signals** — not resolved, ≥ 14 days open, ≥ 5 confirmations, escalation level ≥ 1, authority emailed, High/Critical severity.
- **Evidence strength meter** — a 5-indicator score (photo exists, ≥ 5 confirmations, email sent, escalated, ≥ 14 days).
- **AI press release generator** — `utils/pressRelease.js` (`generatePressRelease`) returns headline, subheadline, dateline, a 3-paragraph body (problem → citizen action vs. authority silence → accountability with RTI context), an attributable citizen quote, data points, and an editor's note (deterministic fallback included).
- **48-hour exclusive claim** — A journalist can lock a story for 48h (`storyClaimedBy/At`), enforced at the Firestore-rules layer via `claimWindowOpen()`.
- **Export story package** — anonymized Excel via `exportToExcel(..., 'stories', ...)`.

*Why it matters:* connects civic data to the fourth estate — the most effective accountability lever in India.

### Elected Representative Scorecard

- **Auto-detection of ward from GPS** — At report time, `utils/representatives.js` (`getWardRepresentative`) maps coordinates → ward → representative and tags `wardInfo` on the issue (no user input).
- **Representative tagged on every issue**, shown on IssueDetail's "Your elected representative" card.
- **Resolution-rate scorecard** — `calculateScorecard()` groups all issues by ward+representative and computes resolution rate, average days open, critical-open count, and 30-day-ignored count — covering even older issues by deriving their ward on the fly.
- **Ranked leaderboard** (Leaderboard → Reps tab), with "Responsive Representative" / "Low accountability" framing.
- **Neutral by design** — `party` is a metadata label only; **no party colours, logos, or endorsements**. Resolution rate is the *sole* ranking metric.

*Why it matters:* converts scattered civic complaints into an objective, data-driven accountability metric for the people actually elected to fix them.

### Gemini Voice Assistant

- **Floating mic** (`components/VoiceAssistant.jsx`) on every screen.
- **Web Speech API** for speech-to-text and text-to-speech — **on-device, free**, with a text-input fallback.
- **Live data grounding** — `utils/civicDataContext.js` (`fetchCivicContext`) aggregates issues by status/type/city, adds a **NEAR YOU** block (≤ 3 km of the user's GPS) and the user's **ward representative**, cached 60 s, **PII-free**.
- **Natural-language answers with real numbers** via `callGeminiPlainText` (routes through the same provider chain as the agents).
- **English / Hindi** (`constants/voiceLang.js`) switches STT locale, TTS voice, answer language, suggested questions, and every panel string.
- **Privacy** — "Voice processed on-device. No audio stored."

*Why it matters:* a non-literate or low-friction user can simply *ask* "who is responsible for the garbage near me?" and get a grounded, spoken answer.

### Wall of Fame Leaderboard

- **4 tabs** (`screens/Leaderboard.jsx`): **Citizens, Companies, Colleges, Representatives**.
- **Live citizen data** from `publicProfiles` (top 20 + total count); org data from `organizations` + live `orgStats`.
- **Crown / Medal / Award** for the top 3; a **"YOU"** highlight for the current user.
- **CSR Report generation** per company; per-tab anonymized **Excel export**.

*Why it matters:* recognition is fuel — it turns one-off reporters into repeat civic guardians, and orgs into competing contributors.

### Privacy-Safe Excel Export

- Available on **4 dashboards** (Analytics, Authority, Leaderboard, Journalist) via `utils/exportToExcel.js`.
- **Allowlist sanitization** — only public civic columns are exported; `CONFIDENTIAL_FIELDS` (uids, emails, phones, photo URLs, social handles, **raw lat/lng**, `confirmedBy`, story claimers) are **never** included.
- **Names anonymized** — `anonymizeName("Nikitha Sharma") → "N*****a S****a"` (first + last char kept).
- **Aggregate-only Summary sheet** (counts by type / severity / status) + a privacy-compliance banner in every file.
- **Lazy-loaded** — the `xlsx` library is dynamically imported only when an export runs, keeping route bundles light.

*Why it matters:* open civic data **and** privacy compliance — exportable transparency without exposing a single citizen.

### ESG & SDG Impact Intelligence

- **Agent 6 — ESG Impact Scorer** — `agents/esgScorer.js` (`scoreESGImpact`) fires **after** an issue is marked Resolved (from `AuthorityDashboard` on resolve; an owner-triggered fallback on `IssueDetail`) and uses Gemini (`callGeminiText`) to score the resolved issue across **Environmental / Social / Governance** pillars (`e_score` / `s_score` / `g_score`, each out of 10) with a plain-English impact line + metric per pillar.
- **Deterministic overall blend** — The OVERALL score is **not** trusted from the model: it's computed deterministically as **E × 0.35 + S × 0.35 + G × 0.30** (`ESG_WEIGHTS`), clamped 0–10. *Why:* a defensible, tamper-resistant headline score.
- **UN SDG mapping** — `ISSUE_SDG_MAP` (`constants/esg.js`) maps each issue type to **UN Sustainable Development Goals**, returning `sdg_tags` + `sdg_names` + a one-sentence highlight, rendered with official UN colours (`SDG_COLORS`).
- **Atomic reporter impact** — The scorer saves `esgScore` + `esgScoredAt` onto the issue doc and **atomically increments** the reporter's ESG stats (`esgIssuesResolved`, `totalPeopleImpacted`, `sdgsContributed`) — owner-write only, per Firestore rules.
- **Impact estimates** — `IMPACT_ESTIMATES` carries per-type environmental + social estimates (e.g. **Water Leakage ≈ 45,000 litres/month + 340 households**), and `ESG_GRADES` maps scores to **A+ / A / B+ / B / C / D** with colours.
- **Analytics ESG tab** — `AnalyticsDashboard` adds an **ESG tab** with a City ESG grade card, SDG Contributions progress bars, City ESG Rankings leaderboard (`CityESGCard.jsx`), and Top Environmental Impact. `IssueDetail` shows an `ESGScoreCard` (E/S/G breakdown, SDG pills via `SDGBadge.jsx`, highlight, overall grade) plus an **"ESG Report"** share modal with shareable impact text.
- **City ESG grade everywhere** — `HomeScreen` surfaces a City ESG grade chip that opens the Analytics ESG tab; `AgentsShowcase` adds the Agent 6 card, an **"ESG Scored"** live stat, and extends the pipeline flow **Resolved → ESG Score → SDG Tagged**.
- **Profile ESG impact + badges** — `ProfileScreen` gains an **ESG Impact** section (Water Saved / Waste Addressed / People Impacted metrics + contributed-SDG pills + the 5 ESG badges).
- **Corporate BRSR report** — `generateCorporateESGReport()` produces a Gemini plain-text, **SEBI-BRSR-style** corporate ESG impact report for the Area Adoption (CSR) program.

*Why it matters:* it turns a *closed* civic complaint into measurable, framework-aligned impact — proving to citizens, cities, and corporate sponsors that resolutions deliver real environmental and social value mapped to global goals.

---

## 2.4 Gamification System

### Civic Score points (`CIVIC_SCORE_POINTS`)

| Action | Points |
|---|---|
| Report an issue | **+10** |
| Verify (confirm) an issue | **+5** |
| Share an issue | **+5** |
| Retweet a platform post | **+10** |
| Issue resolved (reporter reward) | **+25** |
| Daily streak (consecutive day) | **+2** |
| Authority action — advance a status | **+5** |
| Authority resolve — with verified photo | **+15** |

### Badges (10) — `BADGE_CONDITIONS`

| Badge | Unlock condition |
|---|---|
| First Step | 1+ issues reported |
| Keen Eye | 5+ issues reported |
| Guardian | 10+ issues reported |
| Community Star | 1+ issue resolved |
| Streak Hero | civic score ≥ 100 |
| Social Voice | 3+ issues shared |
| Verifier | 5+ issues verified |
| City Champion | civic score ≥ 300 |
| Legend | civic score ≥ 500 |
| Civic Authority | civic score ≥ 100 — unlocks authority powers (verify/resolve) |

### ESG Badges (5) — `ESG_BADGES`

| Badge | Unlock condition |
|---|---|
| Water Warrior | 3+ Water Leakage issues reported |
| Green Guardian | 5+ ESG-resolved issues |
| Justice Seeker | 1+ RTI filed |
| Social Champion | 100+ people impacted |
| SDG Contributor | 3+ distinct SDGs contributed |

### Levels (5) — `LEVEL_THRESHOLDS`

| Level | Score range | Icon |
|---|---|---|
| Newcomer | 0 – 50 | Sprout |
| Reporter | 51 – 150 | Eye |
| Guardian | 151 – 300 | Shield |
| Local Hero | 301 – 500 | Star |
| City Guardian | 501+ | Crown |

### Streaks

- **Daily streak tracking** with a **+2 pts/day** consecutive bonus (`useAuth` updates `streak` + `lastActiveDate` on sign-in).
- **Flame icon** streak display on the profile.

---

## 2.5 Issue Types Supported

From `constants/issueTypes.js` (`ISSUE_TYPES`) — a 21-entry taxonomy matching the real civic dataset:

Pothole · Broken Streetlight (Streetlight) · Garbage · Water Leakage · Infrastructure · **Traffic Signal (Not Working)** · Broken Road · Garbage Dumping · Open Manhole · Sewage Overflow · Water Logging · Water Supply Issue · Air Pollution · Noise Pollution · Dangerous Tree · Footpath Encroachment · Illegal Construction · Stray Animal Menace · Traffic Signal Malfunction · Other.

**Severity:** Low · Medium · High · Critical · **Status pipeline:** Reported → Verified → In Progress → Resolved.

---

## 2.6 Cities Supported

From `constants/cities.js` (`CITIES`), each with map coordinates:

**Bangalore · Mumbai · Delhi · Chennai · Hyderabad · Pune · Other** — with complaint-ID city codes BLR / MUM / DEL / CHN / HYD / PNE / OTH (`utils/complaintId.js`). Ward-level representative data ships for Bangalore, Mumbai, Delhi, and Thane (fallback list), extensible via the open-data import.

---

## 2.7 PWA Capabilities

- **Installable** — `public/manifest.json` (standalone display, theme `#00d4ff`, background `#04091a`, maskable 192/512 icons, `portrait-primary`, `en-IN`).
- **Offline service worker** — `vite-plugin-pwa` (Workbox, `registerType: autoUpdate`) precaches the app shell and uses **NetworkFirst** for Firestore.
- **Instant revisits** — Firestore `persistentLocalCache` (IndexedDB, multi-tab) serves reads from local cache, revalidated in the background.
- **Mobile-first responsive** — a 480px max-width app frame, bottom-nav shell, install banner (`InstallBanner` via `beforeinstallprompt`).

---

## 2.8 AI Testing Pipeline

Three **Gemini-powered** Node dev agents (`tests/agents/`) that write, run, and assess the test suite:

1. **Test Writer** (`test:generate`) — reads ~36 source targets (utils, constants, components, hooks, screens, theme) and asks Gemini to generate Vitest + Testing-Library tests into `tests/ai/**`. Existing generated files are **never overwritten**, so manual fixes survive re-runs.
2. **Test Analyzer** (`test:analyze`) — runs the full suite, parses pass/fail, and (only on failures) asks Gemini to diagnose root causes — classified `MOCK_ISSUE | IMPORT_ERROR | LOGIC_BUG | TEST_ISSUE` with one-line fixes — plus a health assessment; writes `tests/report.json`.
3. **Report Generator** (`test:report`) — runs the suite + coverage, asks Gemini for a health/risk assessment and top coverage gaps, and emits a **branded HTML + JSON report** (JanaShakti dark theme) under `tests/reports/`.

AI-generated tests live under `tests/ai/**` and are **isolated** from `npm test`, so a flaky AI test can never red the deterministic suite. Models: `gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash-lite`.

**Latest run:** 410 tests passing (100%) across 52 files (18 deterministic + 34 AI-generated) at ~48% line / 70% branch coverage — see `tests/reports/latest.html`.

---

*JanaShakti — जनशक्ति — People's Power*
*Vibe2Ship 2026 — PS2: Community Hero*
