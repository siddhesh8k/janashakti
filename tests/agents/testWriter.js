// Agent 1 — Test Writer (Gemini-powered)
// Reads source files and asks Gemini to generate Vitest test cases. Generated tests are
// written to tests/ai/** (ISOLATED from the deterministic suite so flaky AI output never
// reds `npm test`). EXISTING generated files are never overwritten (re-running only fills
// in NEW targets), so manual fixes are preserved. Run with: npm run test:generate
//
// Node dev tooling — calls Gemini directly (same pattern as scripts/importExcel.mjs).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT, '.env');

// VITE_ vars aren't auto-loaded in Node — parse .env (same helper as importExcel.mjs).
function readEnv(key) {
  try {
    const m = fs.readFileSync(ENV_PATH, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const API_KEY = readEnv('VITE_GEMINI_API_KEY') || process.env.VITE_GEMINI_API_KEY || '';
// Only these models (per project policy). Chained as fallbacks with retries so transient
// 429/500/503 overloads don't fail generation.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGemini(prompt) {
  let lastErr = 'unknown';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(urlFor(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1 },
          }),
        });
        if ([429, 500, 503].includes(res.status)) { lastErr = `HTTP ${res.status}`; await sleep(2000 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (err) { lastErr = err.message; await sleep(1500); }
    }
  }
  throw new Error(`Gemini ${lastErr} (after retries + fallback)`);
}

// Files to generate tests for (paths relative to project root). EXISTING generated test
// files are skipped (never overwritten) — so re-running only fills in NEW targets.
const TEST_TARGETS = [
  // Utils
  { src: 'src/utils/complaintId.js', type: 'unit' },
  { src: 'src/utils/social.js', type: 'unit' },
  { src: 'src/utils/escalation.js', type: 'unit' },
  { src: 'src/utils/n8n.js', type: 'unit' },
  // Constants
  { src: 'src/constants/issueTypes.js', type: 'unit' },
  { src: 'src/constants/departments.js', type: 'unit' },
  { src: 'src/constants/representatives.js', type: 'unit' },
  // Components
  { src: 'src/components/SeverityBadge.jsx', type: 'component' },
  { src: 'src/components/PressureMeter.jsx', type: 'component' },
  { src: 'src/components/StatsCard.jsx', type: 'component' },
  { src: 'src/components/EmptyState.jsx', type: 'component' },
  { src: 'src/components/Toast.jsx', type: 'component' },
  { src: 'src/components/IssueCard.jsx', type: 'component' },
  // Theme
  { src: 'src/theme/colors.js', type: 'unit' },
  { src: 'src/theme/components.js', type: 'unit' },
  // Hooks
  { src: 'src/hooks/usePagination.js', type: 'hook' },
  { src: 'src/hooks/useLocation.js', type: 'hook' },
  { src: 'src/hooks/useAuth.js', type: 'hook' },
  { src: 'src/hooks/useUser.js', type: 'hook' },
  { src: 'src/hooks/useIssues.js', type: 'hook' },
  { src: 'src/hooks/useNotifications.js', type: 'hook' },
  { src: 'src/hooks/useAgents.js', type: 'hook' },
  // Screens (smoke render tests — raise coverage of the largest files)
  { src: 'src/screens/HomeScreen.jsx', type: 'screen' },
  { src: 'src/screens/ReportScreen.jsx', type: 'screen' },
  { src: 'src/screens/MapScreen.jsx', type: 'screen' },
  { src: 'src/screens/ProfileScreen.jsx', type: 'screen' },
  { src: 'src/screens/IssueDetail.jsx', type: 'screen' },
  { src: 'src/screens/AnalyticsDashboard.jsx', type: 'screen' },
  { src: 'src/screens/AuthorityDashboard.jsx', type: 'screen' },
  { src: 'src/screens/AgentsShowcase.jsx', type: 'screen' },
  { src: 'src/screens/Leaderboard.jsx', type: 'screen' },
  { src: 'src/screens/JournalistDashboard.jsx', type: 'screen' },
  { src: 'src/screens/NotificationsScreen.jsx', type: 'screen' },
  { src: 'src/screens/Onboarding.jsx', type: 'screen' },
];

const SUBDIR = { component: 'components', hook: 'hooks', screen: 'screens', unit: 'unit' };

function buildPrompt(target, code, importPath) {
  if (target.type === 'component') {
    return `You are a senior React test engineer. Write Vitest + @testing-library/react tests for this React component.

FILE: ${target.src}
CODE:
\`\`\`jsx
${code}
\`\`\`

RULES:
- import { describe, it, expect, vi } from 'vitest'
- import { render, screen, fireEvent } from '@testing-library/react'
- import @testing-library/jest-dom for matchers
- Wrap components that use useNavigate in a MemoryRouter from react-router-dom
- Import the component from '${importPath}'
- Mock any Firebase imports
- Test rendering, props, conditional rendering, user interactions, edge cases — at least 5 cases
- JSX only, no TypeScript. Return ONLY the test code, no markdown fences.

CRITICAL — every test MUST pass against the real component:
- Do NOT query icons by ARIA role/name (lucide icons are inline SVGs with no role); assert by visible TEXT (screen.getByText / queryByText).
- Render with minimal VALID props so it never throws; if a prop's shape is unknown, pass a simple object/string/number.
- Use queryBy* and assert presence (toBeTruthy/toBeInTheDocument) only when certain from the code; do NOT assert exact styles, colors, or hex codes.
- Mock every imported module that is not a pure helper.`;
  }

  if (target.type === 'hook') {
    return `You are a senior React test engineer. Write Vitest tests for this custom React hook.

FILE: ${target.src}
CODE:
\`\`\`jsx
${code}
\`\`\`

RULES:
- import { describe, it, expect, vi } from 'vitest'
- import { renderHook, act, waitFor } from '@testing-library/react'
- Import the hook from '${importPath}'
- Firebase (firebase/auth, firebase/firestore) and the app's firebase module are ALREADY mocked globally in tests/setup.js (onAuthStateChanged / onSnapshot call back with empty data; getDoc returns exists:false; getCountFromServer returns count 0). RELY on those — do not re-mock unless necessary.
- For a PURE hook (e.g. usePagination), test its logic directly: initial visible slice, showMore, hasMore, remaining.
- For data hooks (useAuth/useIssues/useUser/useNotifications/useAgents/useGeoLocation), use renderHook and assert the returned object SHAPE and safe defaults (arrays default to [], a loading boolean, etc.). Use waitFor for async state.
- CRITICAL — keep assertions CONSERVATIVE; only assert what is obvious. NEVER assert exact fetched data. Every test MUST pass.
- At least 4 cases. JSX only, no TypeScript. Return ONLY the test code, no markdown fences.`;
  }

  if (target.type === 'screen') {
    return `You are a senior React test engineer. Write a Vitest SMOKE test for this screen — the goal is to render it WITHOUT crashing and assert minimal structure (this raises coverage safely).

FILE: ${target.src}
CODE:
\`\`\`jsx
${code}
\`\`\`

RULES:
- import { describe, it, expect, vi } from 'vitest'
- import { render } from '@testing-library/react'
- import { MemoryRouter } from 'react-router-dom'
- import { ToastProvider } from '../../../src/components/ToastProvider'
- import { LocationProvider } from '../../../src/components/LocationProvider'
- Import the screen (default export) from '${importPath}'
- ALWAYS render wrapped so context hooks work:
  render(<MemoryRouter><ToastProvider><LocationProvider><Screen /></LocationProvider></ToastProvider></MemoryRouter>)
- Firebase, geolocation, SpeechRecognition, matchMedia are mocked globally in tests/setup.js. If the screen imports heavy modules that could throw, mock them with vi.mock returning no-op functions — likely candidates: '../../../src/utils/googleMaps', '../../../src/utils/gemini', '../../../src/utils/cloudinary'. Also you MAY vi.mock the data hooks ('../../../src/hooks/useIssues', '../../../src/hooks/useAuth', etc.) to return safe empty/loading values.
- CRITICAL — this is a SMOKE test that MUST PASS:
  - assert the render does not throw and the container is truthy (const { container } = render(...); expect(container).toBeTruthy()).
  - At most ONE assertion on stable static text that always appears.
  - Do NOT assert dynamic data, counts, async content, or specific elements that depend on fetched data.
- 3-5 conservative tests. JSX only, no TypeScript. Return ONLY the test code, no markdown fences.`;
  }

  // unit (utils / constants / theme)
  return `You are a senior JavaScript test engineer. Write Vitest unit tests for this utility/constants file.

FILE: ${target.src}
CODE:
\`\`\`javascript
${code}
\`\`\`

RULES:
- import { describe, it, expect, vi } from 'vitest'
- Import the module from '${importPath}'
- Test every exported function and constant; cover edge cases (null/empty/invalid) and boundaries — at least 5 cases
- CRITICAL — every assertion MUST match the REAL exported behavior; only assert what is obvious from the code. Do NOT assert exact error-message strings or internal implementation details.
- If a function reads import.meta.env or calls network/Firebase/Gemini, mock those modules with vi.mock (or avoid exercising that path).
- JSX only, no TypeScript. Return ONLY the test code, no markdown fences.`;
}

async function generateTest(target) {
  const filePath = path.resolve(ROOT, target.src);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⏭  Skipping ${target.src} (source not found)`);
    return 'skipped';
  }

  const fileName = path.basename(target.src, path.extname(target.src));
  const subdir = SUBDIR[target.type] || 'unit';
  const testDir = path.resolve(ROOT, 'tests', 'ai', subdir);
  const testPath = path.join(testDir, `${fileName}.test.jsx`);

  if (fs.existsSync(testPath)) {
    console.log(`  ⏭  Exists (preserved): tests/ai/${subdir}/${fileName}.test.jsx`);
    return 'skipped';
  }

  const code = fs.readFileSync(filePath, 'utf-8');
  const importPath = `../../../${target.src.replace(/\.(jsx|js)$/, '')}`;
  const prompt = buildPrompt(target, code, importPath);

  try {
    console.log(`  🤖 Generating tests for ${target.src}...`);
    const testCode = await callGemini(prompt);
    const cleanCode = testCode.replace(/```javascript|```jsx|```js|```/g, '').trim();
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testPath, cleanCode);
    console.log(`  ✅ Generated: ${path.relative(ROOT, testPath)}`);
    return 'generated';
  } catch (err) {
    console.error(`  ❌ Failed: ${target.src} — ${err.message}`);
    return 'failed';
  }
}

async function main() {
  console.log('\n🧪 JanaShakti Test Writer Agent');
  console.log('================================');
  if (!API_KEY) {
    console.error('Missing VITE_GEMINI_API_KEY (.env). Add it before generating tests.');
    process.exit(1);
  }
  console.log(`Using model: ${MODELS[0]} (fallback: ${MODELS.slice(1).join(', ') || 'none'})`);
  console.log(`Targets: ${TEST_TARGETS.length} — generating only the ones not already in tests/ai/**\n`);

  const results = { generated: 0, failed: 0, skipped: 0 };

  for (const target of TEST_TARGETS) {
    const result = await generateTest(target);
    results[result]++;
    if (result === 'generated' || result === 'failed') await sleep(2000); // rate-limit only after an API call
  }

  console.log('\n================================');
  console.log(`✅ Generated: ${results.generated}`);
  console.log(`⏭  Skipped (existing/missing): ${results.skipped}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('\nRun the AI tests with: npm run test:ai');
  console.log('Analyze results with:  npm run test:analyze\n');
}

main().catch(console.error);
