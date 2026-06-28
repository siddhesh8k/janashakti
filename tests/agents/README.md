# JanaShakti AI Testing Agents

Two Google-Gemini-powered agents that write and analyze tests for the app. They are Node
dev tools (they call Gemini directly, like `scripts/importExcel.mjs`) and read the same
`VITE_GEMINI_API_KEY` from `.env`.

## Agent 1 — Test Writer (Gemini-powered)

Reads source files and generates Vitest test cases.

```bash
npm run test:generate
```

What it does:
1. Reads ~15 source files (utils, constants, components, theme).
2. Sends each to Gemini with a specialized prompt.
3. Writes generated test files to **`tests/ai/unit/`** and **`tests/ai/components/`**
   (isolated — see "Isolation" below).
4. Respects rate limits (2 s delay between calls; auto-retry on HTTP 429).

Missing files are skipped gracefully.

## Agent 2 — Test Analyzer (Gemini-powered)

Runs the full suite and asks Gemini to diagnose any failures.

```bash
npm run test:analyze
```

What it does:
1. Runs `vitest run --reporter=verbose` (the full suite, including `tests/ai`).
2. Captures pass/fail counts.
3. If failures: sends the error output to Gemini for root-cause analysis,
   classifying each as `MOCK_ISSUE | IMPORT_ERROR | LOGIC_BUG | TEST_ISSUE` + a one-line fix.
4. If all green: generates a coverage report (no Gemini call).
5. Saves a summary to `tests/report.json`.

## Agent 3 — Report Generator (Gemini-powered)

Runs the full suite + coverage in one pass, asks Gemini for a health/risk assessment, and
produces a branded HTML + JSON report.

```bash
npm run test:report
```

What it does:
1. Runs `vitest run --coverage --reporter=verbose` (full suite, one pass).
2. Reads coverage from `coverage/coverage-summary.json` (the `json-summary` reporter).
3. Counts source files and test files (across `src/` and `tests/`).
4. Sends results to Gemini for a health assessment + top coverage gaps + risk + one
   recommendation.
5. Writes a styled HTML report (JanaShakti dark theme) + a machine-readable JSON report.

Outputs (under `tests/reports/`):
- `test-report-YYYY-MM-DD.html` (branded visual report)
- `report-YYYY-MM-DD.json` (machine-readable, for CI)
- `latest.html` / `latest.json` (always the most recent)

Agent 3 supersedes Agent 2 for the full pipeline (it also runs the suite + calls Gemini),
but **Agent 2 is retained** as the lighter `test:analyze` failure-diagnosis command.

## Full pipeline

```bash
npm run test:full   # Agent 1 (generate tests) → Agent 3 (run + analyze + report)
```

## Isolation (important)

AI-generated tests live under `tests/ai/**` and are **excluded from the default
`npm test`**, which runs only the deterministic set (the existing `src/**` suite + the
hand-written `tests/unit/core.test.jsx`). This keeps the main suite green even if the AI
produces a flaky or incorrect test. Run the AI tests on their own with `npm run test:ai`;
the analyzer (`test:analyze`) runs everything.

## Commands

| Command | Runs |
|---|---|
| `npm test` | Deterministic suite (existing `src/**` + `tests/unit`) |
| `npm run test:watch` | Vitest watch mode (full) |
| `npm run test:coverage` | Coverage over the deterministic suite |
| `npm run test:ai` | AI-generated tests only (`tests/ai`) |
| `npm run test:generate` | Agent 1 — generate AI tests |
| `npm run test:analyze` | Agent 2 — run + diagnose failures, write `tests/report.json` |
| `npm run test:report` | Agent 3 — run + coverage + AI assessment → HTML/JSON in `tests/reports/` |
| `npm run test:full` | Agent 1 (generate) then Agent 3 (run + analyze + report) |

## Google technology used

- **Gemini 2.5 Flash Lite** — AI engine for test generation and failure analysis.
- Same API key as the main app (`VITE_GEMINI_API_KEY`).
