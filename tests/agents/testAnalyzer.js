// Agent 2 — Test Analyzer (Gemini-powered)
// Runs the full Vitest suite, parses pass/fail, and — only when there are failures —
// asks Gemini to diagnose root causes + suggest fixes. Writes tests/report.json.
// Run with: npm run test:analyze

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT, '.env');

function readEnv(key) {
  try {
    const m = fs.readFileSync(ENV_PATH, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const API_KEY = readEnv('VITE_GEMINI_API_KEY') || process.env.VITE_GEMINI_API_KEY || '';
// Only these models (per project policy). Chained as fallbacks with retries so transient
// 429/500/503 overloads don't fail the run.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGemini(prompt) {
  if (!API_KEY) return 'Gemini unavailable (no VITE_GEMINI_API_KEY in .env).';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(urlFor(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
        });
        if ([429, 500, 503].includes(res.status)) { await sleep(1500 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';
      } catch { await sleep(1200); }
    }
  }
  return 'Gemini unavailable for analysis (overloaded — retries + fallback exhausted).';
}

async function main() {
  console.log('\n🔬 JanaShakti Test Analyzer Agent');
  console.log('==================================\n');

  // Run the FULL suite (src + tests/unit + tests/ai) and capture output.
  let testOutput = '';
  let exitCode = 0;
  try {
    testOutput = execSync('npx vitest run --reporter=verbose 2>&1', {
      cwd: ROOT, encoding: 'utf-8', timeout: 600000,
    });
  } catch (err) {
    testOutput = err.stdout || err.stderr || err.message;
    exitCode = err.status || 1;
  }

  console.log(testOutput);

  // Parse results — take the LAST "N passed/failed" so we count test CASES (the "Tests"
  // line) rather than the "Test Files" line that appears before it.
  const passes = [...testOutput.matchAll(/(\d+) passed/g)];
  const fails = [...testOutput.matchAll(/(\d+) failed/g)];
  const totalPassed = passes.length ? parseInt(passes[passes.length - 1][1]) : 0;
  const totalFailed = fails.length ? parseInt(fails[fails.length - 1][1]) : 0;

  console.log('\n==================================');
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);

  if (totalFailed > 0) {
    console.log('\n🤖 Asking Gemini to analyze failures...\n');
    const failIdx = testOutput.indexOf('FAIL');
    const failureSection = (failIdx >= 0 ? testOutput.substring(failIdx) : testOutput).substring(0, 3000);

    const analysis = await callGemini(`You are a senior test engineer debugging failing tests for a React + Vite + Firebase app called JanaShakti (civic issue reporting platform).

Here are the test failures:

${failureSection}

For each failure:
1. Identify the root cause (mock issue, import error, logic bug, or test issue)
2. Classify as: MOCK_ISSUE | IMPORT_ERROR | LOGIC_BUG | TEST_ISSUE
3. Give a one-line fix suggestion

Format as:
FAILURE: [test name]
CAUSE: [classification]
FIX: [one-line suggestion]

Then end with a 2-3 sentence overall health assessment of the codebase.`);

    console.log('📊 Gemini Analysis:');
    console.log('-------------------');
    console.log(analysis);
  } else if (totalPassed > 0) {
    console.log('\n🎉 All tests passed!');
    try {
      console.log('\n📊 Generating coverage report...');
      execSync('npx vitest run src tests/unit --coverage 2>&1', {
        cwd: ROOT, encoding: 'utf-8', timeout: 120000, stdio: 'pipe',
      });
      console.log('Coverage report generated at: coverage/index.html');
    } catch {
      console.log('Coverage report generation skipped.');
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    app: 'JanaShakti',
    passed: totalPassed,
    failed: totalFailed,
    total: totalPassed + totalFailed,
    passRate: totalPassed + totalFailed > 0
      ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100)
      : 0,
    status: totalFailed === 0 ? 'PASS' : 'FAIL',
  };

  fs.writeFileSync(path.join(ROOT, 'tests', 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n📝 Report saved: tests/report.json`);
  console.log(`   Pass rate: ${report.passRate}%`);

  process.exit(exitCode);
}

main().catch(console.error);
