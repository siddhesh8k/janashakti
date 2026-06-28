<div align="center">

# JanaShakti — जनशक्ति

### People's Power — an AI civic-intelligence Progressive Web App for India

[![PWA](https://img.shields.io/badge/PWA-installable-00d4ff)](public/manifest.json)
[![React 18](https://img.shields.io/badge/React-18.3-00d4ff?logo=react&logoColor=white)](https://react.dev)
[![Vite 5](https://img.shields.io/badge/Vite-5.4-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore%20%2B%20Hosting-ffca28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev)
[![Language](https://img.shields.io/badge/JSX-only%20·%20no%20TypeScript-16a34a)](#)
[![Tests](https://img.shields.io/badge/tests-403%20passing-16a34a)](#-testing--ai-testing-pipeline)

**Report civic issues. Build community pressure. Hold authorities accountable.**

*Vibe2Ship 2026 · PS2 — Community Hero · Solo developer*

</div>

---

## What is JanaShakti?

**JanaShakti** turns a single photo of a civic problem — a pothole, a dead streetlight, an overflowing bin — into a fully-formed, AI-analysed, authority-routed, community-verifiable complaint with a legal paper trail and an automatic escalation clock.

It closes the loop that every Indian civic-complaint app leaves open: **after you report, nothing happens.** JanaShakti answers that with:

- a **5-agent Google Gemini pipeline** that classifies the issue, drafts the complaint, detects duplicates, routes it to the right department, and predicts a resolution timeline;
- an **n8n automation layer** that emails the department and posts to social media;
- a **time-based escalation engine** that climbs Ward Officer → Department Head → Commissioner → Media at 7 / 14 / 30 days;
- a **transparency layer** that ranks elected representatives by their real resolution rate, equips journalists with story-ready feeds, and lets companies/colleges adopt civic zones.

Built **end-to-end on Google's stack** (Gemini · Firebase · Google Maps) with **no custom backend** — all business logic runs client-side and is secured by Firestore Security Rules.

> 🔗 **Live demo:** `https://janashakti-9ded8.web.app` · **Problem statement:** PS2 — Community Hero
> 📚 **Full docs:** [Architecture](docs/ARCHITECTURE.md) · [Features](docs/FEATURES.md) · [Timeline](docs/TIMELINE.md) · [Submission](docs/SUBMISSION.md)

---

## Table of Contents

- [Key Features](#-key-features)
- [The 5-Agent Gemini Pipeline](#-the-5-agent-gemini-pipeline)
- [Tech Stack](#-tech-stack)
- [Architecture at a Glance](#-architecture-at-a-glance)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [npm Scripts](#-npm-scripts)
- [Firebase Setup & Deployment](#-firebase-setup--deployment)
- [n8n Automation](#-n8n-automation)
- [Testing & AI Testing Pipeline](#-testing--ai-testing-pipeline)
- [Data Model](#-data-model-cloud-firestore)
- [Security Model](#-security-model)
- [Design System](#-design-system)
- [Data Sources](#-data-sources-production-pipeline)
- [Google Technology Footprint](#-google-technology-footprint)
- [Documentation](#-documentation)
- [License & Credits](#-license--credits)

---

## ✨ Key Features

<table>
<tr><td width="50%" valign="top">

**🤖 AI-Powered Reporting**
- Gemini Vision photo analysis → type, severity, description, department, complaint letter, legal right
- AI guard rail rejects non-civic images (selfies, food, memes)
- Self-correcting analyzer re-examines low-confidence photos
- Manual fallback form when AI is unavailable
- Complaint IDs: `JS-CITY-YEAR-SEQUENCE`
- GPS auto-location + Google reverse geocoding
- Photo (inline base64) + short video (Cloudinary) reports

**🧠 4-Agent Intelligence Pipeline (+5th verifier)**
- Analyzer → Duplicate Detector → Authority Router → Resolution Predictor
- Each agent's output feeds the next
- Resolution Verifier judges fix photos (flags, never blocks)
- Live reasoning trace + `agents_log` / `agent_runs` logging
- Model fallback chain for rate-limit resilience

**🔥 Community Pressure System**
- Pressure Meter (confirmation-threshold bar)
- Geofenced verification within 500 m (+5 civic score)
- Auto-post at 5 confirmations (exactly once)
- Wall of Shame for 30+ day-ignored issues

**⚖️ Legal Empowerment**
- AI-generated RTI applications (RTI Act 2005)
- Formal complaint letters
- Contextual citizen legal rights per issue

**📣 Social Amplification**
- X / WhatsApp / LinkedIn / Facebook / Telegram share links
- Consent model: tag me / anonymous / don't post
- Platform-only auto-posting (no user OAuth)

</td><td width="50%" valign="top">

**🏛️ Automated Accountability (n8n)**
- Auto-escalation engine (7 / 14 / 30-day triggers)
- Escalation chain: Ward → Dept Head → Commissioner → Media
- Formal authority email per report
- SLA tracking per department

**🏆 Civic Gamification**
- Civic score (6 point actions)
- 9 badges, 5 levels, daily streaks (+2/day)

**🎉 Resolution & Celebration**
- Authority dashboard with status management
- Resolution photo upload + AI verification
- Confetti celebration + reporter reward (+25)
- Before/After slider

**🚀 Unique Differentiators**
- **Corporate / College zone adoption** + AI CSR reports + LinkedIn posts
- **Journalist dashboard** — story-ready filter, AI press releases, 48h exclusives
- **Elected Representative Scorecard** — GPS→ward→rep tagging, resolution-rate ranking (neutral by design)
- **Gemini Voice Assistant** — bilingual (EN/HI) Q&A over live, PII-free data
- **Wall of Fame Leaderboard** — Citizens / Companies / Colleges / Representatives
- **Privacy-safe Excel export** — anonymized, on 4 dashboards
- **AI Testing Pipeline** — 3 Gemini agents that write, run & assess tests

</td></tr>
</table>

> 📖 Every feature with its "why" and "how" is documented in **[docs/FEATURES.md](docs/FEATURES.md)**.

---

## 🧠 The 5-Agent Gemini Pipeline

All AI routes through `fetchAI()` in [`src/utils/gemini.js`](src/utils/gemini.js). Agents run as a coordinated pipeline (`src/agents/orchestrator.js`) — **each agent's output feeds the next**, and every step streams a live trace to the on-screen overlay.

```mermaid
flowchart LR
    Photo([📷 Photo]) --> A1
    A1["<b>Agent 1</b><br/>Issue Analyzer<br/>Vision + fn-calling"]
    A1 -->|genuine?| A2["<b>Agent 2</b><br/>Duplicate Detector<br/>geo 200m + text"]
    A2 -->|unique| Save[(addDoc → issues)]
    Save --> A3["<b>Agent 3</b><br/>Authority Router<br/>text + n8n email"]
    A3 -->|routedTo| A4["<b>Agent 4</b><br/>Resolution Predictor<br/>text · uses A3 output"]
    A4 --> Persist[(updateDoc + agent_runs trace)]
    Fix([🛠️ Fix photo]) --> A5["<b>Agent 5</b><br/>Resolution Verifier<br/>Vision · flags never blocks"]
```

| Agent | File | Gemini mode | Output |
|---|---|---|---|
| **1 · Issue Analyzer** | `agents/issueAnalyzer.js` | Vision + function-calling | type, severity, description, department, complaint, legal right, confidence, genuineness |
| **2 · Duplicate Detector** | `agents/duplicateDetector.js` | Firestore geo + text | `isDuplicate` (±0.002° ≈ 200 m + similarity > 65%) |
| **3 · Authority Router** | `agents/authorityRouter.js` | text + n8n | department, officer, email subject, urgency, SLA, escalation path |
| **4 · Resolution Predictor** | `agents/resolutionPredictor.js` | text | priority score, predicted days, escalation risk, recommendation, factors |
| **5 · Resolution Verifier** | `agents/resolutionVerifier.js` | Vision | is the fix genuine & resolved? |

**Beyond the agents, Gemini also powers:** RTI applications, press releases, CSR reports, city insights, social captions, the voice assistant, and the 3 AI testing agents.
**Model fallback chain:** `gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash` (falls through on 404/429/503).
**Serving path:** optional n8n proxy (keeps the key server-side) → direct Gemini (default), via `VITE_N8N_AI_WEBHOOK`.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18.3 + Vite 5.4 (**JSX only — zero TypeScript**) |
| **Routing** | react-router-dom 6.23 (12 routes, lazy + Suspense) |
| **Icons** | lucide-react 0.383 (no emoji UI icons) |
| **Charts** | recharts 2.12 |
| **PWA** | vite-plugin-pwa 0.20 (Workbox) |
| **Auth + Data + Hosting** | Firebase 10.12 — Auth · Cloud Firestore · Hosting |
| **AI** | Google Gemini 2.5 Flash (Google AI Studio) — vision · text · function-calling |
| **Maps** | Google Maps JavaScript API + Geocoding API |
| **Automation** | n8n Cloud — 4 webhook workflows |
| **Media** | Photos inline base64 in Firestore · short videos on Cloudinary |
| **Testing** | Vitest 2.1 + @testing-library/react + jsdom |
| **Data import (dev)** | firebase-admin 12.7 + xlsx 0.18 + sharp 0.35 |

---

## 🏗 Architecture at a Glance

```mermaid
flowchart TB
    subgraph Client["React 18 PWA (Vite + Workbox)"]
        UI["Screens · Components · Hooks"]
        Agents["AI Agents (client-side)"]
    end
    subgraph Google["Google Cloud"]
        Auth["Firebase Auth<br/>Google · Email · Anonymous"]
        FS[("Cloud Firestore<br/>9 collections")]
        Host["Firebase Hosting"]
        Gem["Gemini 2.5 Flash chain"]
        Maps["Google Maps + Geocoding"]
    end
    subgraph Automation["n8n Cloud"]
        N["issue_intelligence · authority_email<br/>social_post · escalation"]
    end
    Cloud["Cloudinary (videos)"]

    UI <--> Auth
    UI <-->|onSnapshot / getDocs| FS
    UI --> Agents --> Gem
    Agents --> FS
    Agents -->|triggerN8N| N
    UI --> Maps
    UI -->|uploadVideo| Cloud
    Host -->|serves bundle| Client
    N -.->|email| Dept["🏛️ Department"]
    N -.->|@JanaShaktiApp| Social["📣 X / LinkedIn"]
```

- **No backend / no Cloud Functions** — Firestore is the single source of truth; security is enforced entirely by **Firestore Security Rules**.
- **Real-time first** — feeds use `onSnapshot`; confirmations run in a **transaction** so the social trigger fires exactly once.
- **Graceful degradation** — every AI call, n8n trigger, and geocode is try/catch-wrapped with a deterministic fallback.

> Full diagrams, data-flow charts, and the agent collaboration model: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## 📁 Project Structure

```
janashakti/
├── src/
│   ├── App.jsx                  # Router shell (12 lazy routes, NavGuard, providers)
│   ├── main.jsx                 # Entry point
│   ├── firebase.js              # Firebase init, Auth, Firestore (persistent cache)
│   ├── index.css                # The only CSS file (per CLAUDE.md)
│   ├── agents/                  # AI agents
│   │   ├── orchestrator.js      # Coordinates the 4-agent submit pipeline
│   │   ├── issueAnalyzer.js     # Agent 1 — Gemini Vision + function-calling
│   │   ├── duplicateDetector.js # Agent 2 — geo + Gemini text
│   │   ├── authorityRouter.js   # Agent 3 — Gemini text + n8n email
│   │   ├── resolutionPredictor.js # Agent 4 — Gemini text
│   │   └── resolutionVerifier.js  # Agent 5 — Gemini Vision (resolution proof)
│   ├── screens/                 # 12 screens
│   │   ├── HomeScreen.jsx · ReportScreen.jsx · MapScreen.jsx · ProfileScreen.jsx
│   │   ├── IssueDetail.jsx · AnalyticsDashboard.jsx · AuthorityDashboard.jsx
│   │   ├── AgentsShowcase.jsx · Leaderboard.jsx · JournalistDashboard.jsx
│   │   └── NotificationsScreen.jsx · Onboarding.jsx
│   ├── components/              # 26 reusable components (IssueCard, PressureMeter,
│   │                            #   VoiceAssistant, BeforeAfterSlider, ChartCarousel…)
│   ├── hooks/                   # useAuth · useUser · useIssues · useAgents ·
│   │                            #   useLocation · useNotifications · usePagination
│   ├── utils/                   # gemini · n8n · social · escalation · confirmIssue ·
│   │                            #   rti · pressRelease · csrReport · story · exportToExcel ·
│   │                            #   representatives · organizations · orgStats · geocode ·
│   │                            #   googleMaps · cloudinary · complaintId · voiceAssistant …
│   ├── constants/               # issueTypes · departments · cities · representatives ·
│   │                            #   mapStyle · voiceLang
│   └── theme/                   # colors · typography · spacing · components
├── tests/
│   ├── unit/                    # Hand-written deterministic tests
│   ├── ai/                      # AI-GENERATED tests (isolated from `npm test`)
│   ├── agents/                  # 3 Gemini testing agents (writer · analyzer · reporter)
│   └── reports/                 # Branded HTML/JSON test reports
├── scripts/                     # Admin-SDK importers (Excel data, representatives, logo)
├── n8n/                         # n8n workflow JSON + setup README
├── docs/                        # ARCHITECTURE · FEATURES · TIMELINE · SUBMISSION
├── public/                      # logo, icons, manifest.json
├── firestore.rules              # Field-level security rules
├── firestore.indexes.json       # Composite indexes
├── firebase.json · .firebaserc  # Hosting + Firestore deploy config
├── vite.config.js               # Vite + PWA + Vitest config
└── .env.example                 # Environment template
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- A **Firebase** project (Auth + Firestore enabled)
- A **Google AI Studio** API key (Gemini) — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- A **Google Maps** API key (Maps JavaScript + Geocoding enabled)
- *(Optional)* a **Cloudinary** account (video uploads) and an **n8n Cloud** account (automation)

### Install & run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then fill in your keys (see below)

# 3. Start the dev server
npm run dev                 # → http://localhost:5173

# 4. Production build + local preview
npm run build
npm run preview
```

> The app degrades gracefully: missing n8n / Cloudinary keys simply disable those features. A missing Gemini key falls back to the manual report form.

---

## 🔐 Environment Variables

Copy `.env.example` → `.env` and fill in. **Never commit `.env`.** All keys are read via `import.meta.env.VITE_*`.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase web SDK config |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firestore project |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | Config field (Storage **not** used at runtime) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase config |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase config |
| `VITE_FIREBASE_MEASUREMENT_ID` | ➖ | Analytics (optional) |
| `VITE_GEMINI_API_KEY` | ✅ | Google AI Studio key — powers all AI |
| `VITE_GOOGLE_MAPS_KEY` | ✅ | Google Maps JS + Geocoding |
| `VITE_CLOUDINARY_CLOUD_NAME` | ➖ | Short report-video hosting |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | ➖ | Cloudinary **unsigned** preset |
| `VITE_N8N_AI_WEBHOOK` | ➖ | Optional AI proxy (keeps model key server-side) |
| `VITE_N8N_ISSUE_WEBHOOK` | ➖ | `issue_intelligence` workflow |
| `VITE_N8N_SOCIAL_WEBHOOK` | ➖ | `social_post` workflow |
| `VITE_N8N_AUTH_WEBHOOK` | ➖ | `authority_email` workflow |
| `VITE_N8N_ESCALATE_WEBHOOK` | ➖ | `escalation` workflow |

---

## 📜 npm Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the **deterministic** suite (`src/**` + `tests/unit`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage over the deterministic suite |
| `npm run test:ai` | Run only the **AI-generated** tests (`tests/ai`) |
| `npm run test:generate` | **Agent 1** — Gemini writes tests into `tests/ai/**` |
| `npm run test:analyze` | **Agent 2** — run + Gemini diagnoses failures → `tests/report.json` |
| `npm run test:report` | **Agent 3** — run + coverage + Gemini health report → `tests/reports/` |
| `npm run test:full` | Agent 1 (generate) → Agent 3 (run + report) |
| `npm run deploy` | Build + deploy Hosting **and** Firestore rules + indexes |
| `npm run deploy:rules` | Deploy only Firestore rules + indexes |
| `npm run import:data` | Admin-SDK import of the demo dataset (`scripts/importExcel.mjs`) |

---

## 🔥 Firebase Setup & Deployment

1. Create a Firebase project; enable **Authentication** (Google, Email/Password, Anonymous) and **Cloud Firestore**.
2. Copy the web-app SDK config into your `.env` (the `VITE_FIREBASE_*` keys).
3. Set the active project (already wired to `janashakti-9ded8` in `.firebaserc`):
   ```bash
   firebase use --add        # select your project
   ```
4. Deploy:
   ```bash
   npm run deploy            # Hosting + Firestore rules + indexes
   # or just the rules/indexes:
   npm run deploy:rules
   ```

**Hosting config** (`firebase.json`): serves `dist/`, SPA rewrite `** → /index.html`, a `Cross-Origin-Opener-Policy` header (so Google auth popups work), immutable caching for `/assets/**`, and no-cache for the service worker + manifest.

> **Free-tier by design:** the app runs entirely on the Firebase **Spark** plan. Firebase Storage is intentionally **not** used — photos are stored inline as compressed base64 on the issue document, and videos go to Cloudinary.

---

## 🤖 n8n Automation

Four fire-and-forget webhook workflows (`src/utils/n8n.js`), all try/catch-wrapped so a webhook outage never affects the app:

| Workflow | Env var | Trigger | Action |
|---|---|---|---|
| `issue_intelligence` | `VITE_N8N_ISSUE_WEBHOOK` | every new report | Logging / dashboards |
| `authority_email` | `VITE_N8N_AUTH_WEBHOOK` | Agent 3 routing | Formal complaint email to the department (HTTP node) |
| `social_post` | `VITE_N8N_SOCIAL_WEBHOOK` | Critical / ≥ 5 confirmations | Post to `@JanaShaktiApp` (X / LinkedIn) |
| `escalation` | `VITE_N8N_ESCALATE_WEBHOOK` | escalation level increase | Escalation + Wall-of-Shame alert |

An optional AI proxy (`VITE_N8N_AI_WEBHOOK`) keeps the model API key server-side. Workflow JSON + setup notes are in [`n8n/`](n8n/README.md).

---

## 🧪 Testing & AI Testing Pipeline

The suite is split into a **deterministic** set (always green) and an **AI-generated** set (isolated):

- `npm test` runs only `src/**` + `tests/unit` — so a flaky AI test can never red the build.
- `npm run test:ai` runs the AI-generated tests under `tests/ai/**`.

**3 Gemini-powered testing agents** (`tests/agents/`):

```mermaid
flowchart LR
    Src([src/]) --> W["Agent 1 · Test Writer<br/>test:generate"]
    W -->|writes, never overwrites| AI[("tests/ai/**")]
    AI --> An["Agent 2 · Test Analyzer<br/>test:analyze"]
    AI --> R["Agent 3 · Report Generator<br/>test:report"]
    An -->|tests/report.json| J[(JSON)]
    R -->|branded HTML + JSON| H[(tests/reports/latest.html)]
```

1. **Test Writer** — reads ~36 source targets and generates Vitest + Testing-Library tests.
2. **Test Analyzer** — runs the suite, classifies failures (`MOCK_ISSUE / IMPORT_ERROR / LOGIC_BUG / TEST_ISSUE`) + health note.
3. **Report Generator** — runs suite + coverage, Gemini health/risk assessment → branded HTML report.

> **Latest run:** **403 tests passing (100%)** across 51 files (17 deterministic + 34 AI-generated) at ~47% line / 71% branch coverage. Testing-agent models: `gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash-lite`.

---

## 🗄 Data Model (Cloud Firestore)

Nine collections, all written client-side and secured by `firestore.rules`:

| Collection | Purpose |
|---|---|
| `issues` | The central document — report → routing → prediction → resolution → social → story (~55 fields) |
| `users` | Private profile (owner-only) — score, badges, level, streak, affiliation |
| `publicProfiles` | Public, display-only leaderboard mirror |
| `organizations` | Adopted-zone companies / colleges |
| `agents_log` | Per-agent audit log (input, output, latency, success, model) |
| `agent_runs` | Orchestrated pipeline step-traces (Agents Showcase) |
| `representatives` | Ward → elected representative reference data (open-data import) |
| `authorities` | Authority allowlist (gates trust-sensitive fields) |
| `meta` | Seed marker (vestigial) |

Composite indexes are in `firestore.indexes.json`. Full field-by-field schema: **[docs/ARCHITECTURE.md §5](docs/ARCHITECTURE.md)**.

---

## 🛡 Security Model

- **Field-level Firestore rules** — owners may write any field on their own issue; **authorities** (allowlist) may write only status/resolution/agent fields; **any signed-in user** may touch only low-trust community fields (confirmations, escalation, story claim within a 48h window).
- **Auth** — Google · Email/Password · Anonymous; user profiles auto-created on first sign-in (identity-only refresh on return — never re-zeroes score).
- **API keys** — all in `import.meta.env.VITE_*`; an optional n8n AI proxy removes the model key from the client; Cloudinary uses an **unsigned** preset.
- **Abuse controls** — AI guard rail blocks non-civic images; verification is GPS-geofenced to 500 m; one vote per user; exactly-once social posting; Agent 5 flags fake fix photos.
- **Privacy** — Excel exports are anonymized (allowlist sanitization, name masking, no uids/emails/coordinates); the voice assistant processes speech on-device and stores no audio.
- **Social consent** — per-issue `tag` / `anonymous` / `none`; posts originate only from `@JanaShaktiApp` (no user OAuth).

---

## 🎨 Design System

A strict palette derived from the JanaShakti holographic-fist logo (see `src/theme/` and the project `CLAUDE.md`):

| Token | Hex | Use |
|---|---|---|
| Cyan (primary) | `#00d4ff` | Buttons, active tabs, links, brand |
| Green (secondary) | `#16a34a` | Success, civic score, resolved |
| Screen background | `#080f1e` | All screens |
| Card background | `#0d1b2e` | All cards (0.5px border `#1a2f4a`) |
| Text primary / body / muted | `#f0f6ff` / `#94a3b8` / `#4a6280` | Typography hierarchy |

Severity: Critical `#ef4444` · High `#f97316` · Medium `#eab308` · Low `#22c55e`.
**Rules:** JSX only · Lucide icons only (no emoji UI icons) · string font-weights · LinkedIn-style cards.

---

## 🌐 Data Sources (production pipeline)

Reference data (wards, representatives, civic baselines) is designed to ingest via the Admin SDK (`scripts/importRepresentatives.mjs`, `scripts/importExcel.mjs`) from India's open-data ecosystem:

- **data.gov.in** — Open Government Data civic datasets
- **lgdirectory.gov.in** — official Local Government Directory ward codes
- **myneta.info** — ADR/MyNeta elected-representative records
- **datameet / india-election-data** — community ward-boundary GeoJSON
- **smartcities.data.gov.in** — Smart Cities Mission datasets

*(The shipped demo uses a curated built-in fallback ward list, extensible per-city through the importer.)*

---

## 🔵 Google Technology Footprint

| Google product | Where it powers JanaShakti |
|---|---|
| **Gemini 2.5 Flash** (AI Studio) | The entire 5-agent pipeline + RTI, press releases, CSR reports, city insights, social captions, the voice assistant, and the 3 AI testing agents. Uses vision, text & function-calling. |
| **Firebase Authentication** | Google · Anonymous · Email sign-in, with auto-created profiles |
| **Cloud Firestore** | Real-time database of record (9 collections) with offline IndexedDB persistence |
| **Firebase Hosting** | Global SPA + PWA delivery, SPA rewrites, auth-popup COOP header |
| **Google Maps JavaScript API** | Dark-themed map, severity markers, adopted-zone overlays, draggable picker |
| **Google Maps Geocoding API** | Reverse + forward geocoding |
| **Firebase Security Rules** | Field-level, zero-backend authorization |

---

## 📚 Documentation

| Document | Contents |
|---|---|
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | System & application architecture, agent pipeline, 8 data-flow diagrams, full Firestore schema, API integrations, n8n, AI testing pipeline, security |
| **[docs/FEATURES.md](docs/FEATURES.md)** | Every feature with what / why / how, gamification tables, issue types, cities, PWA |
| **[docs/TIMELINE.md](docs/TIMELINE.md)** | Day-by-day build log (June 24–29, 2026) |
| **[docs/SUBMISSION.md](docs/SUBMISSION.md)** | Official Vibe2Ship 2026 submission — overview, features, Google-tech detail |

---

## 📄 License & Credits

Built for **Vibe2Ship 2026** (PS2 — Community Hero) by a **solo developer**.

Open-source libraries: React, React DOM, Vite (MIT) · react-router-dom, recharts, vitest (MIT) · lucide-react (ISC) · firebase, firebase-admin, sharp, xlsx (Apache-2.0). Google Gemini, Firebase, and Google Maps are used under Google's API Terms of Service; n8n under the Sustainable Use License; Cloudinary under its free-tier ToS.

---

<div align="center">

**JanaShakti — जनशक्ति — People's Power**
*Vibe2Ship 2026 — PS2: Community Hero*

</div>
