// Agent 3 — Test Report Generator (Gemini-powered)
// Runs the full Vitest suite + coverage in ONE pass, asks Gemini for a health/risk
// assessment, and produces a branded HTML + JSON report under tests/reports/.
// Run with: npm run test:report
//
// Node dev tooling — calls Gemini directly (same pattern as scripts/importExcel.mjs).

import { execSync } from 'child_process';
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
// Only these models (per project policy). Chained as fallbacks with retries.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
const MODEL_LABEL = 'Gemini 2.5 Flash';
const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Strip ANSI color codes so regex parsing of Vitest's verbose output is reliable.
const stripAnsi = (s) => s.replace(/\[[0-9;]*m/g, '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function callGemini(prompt) {
  if (!API_KEY) return 'Analysis unavailable (no VITE_GEMINI_API_KEY in .env).';
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
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch { await sleep(1500); }
    }
  }
  return 'Analysis unavailable (Gemini overloaded — retries + fallback exhausted).';
}

// Run the full suite (incl. tests/ai) ONCE with coverage — gets both the results and the
// coverage summary. (Requires the AI tests to be green; a run with failing test files can
// fail to finalize coverage.)
function runTestsWithCoverage() {
  let raw = '';
  let exitCode = 0;
  try {
    raw = execSync('npx vitest run --coverage --reporter=verbose 2>&1', {
      cwd: ROOT, encoding: 'utf-8', timeout: 600000,
    });
  } catch (err) {
    raw = err.stdout || err.stderr || err.message;
    exitCode = err.status || 1;
  }

  const output = stripAnsi(raw);

  // Take the LAST "N passed/failed/skipped" — the per-test "Tests" summary line, not the
  // "Test Files" line that appears before it.
  const last = (re) => { const m = [...output.matchAll(re)]; return m.length ? parseInt(m[m.length - 1][1]) : 0; };
  const passed = last(/(\d+)\s+passed/g);
  const failed = last(/(\d+)\s+failed/g);
  const skipped = last(/(\d+)\s+skipped/g);
  const total = passed + failed + skipped;
  const durationMatch = output.match(/Duration\s+([\d.]+\s*\w+)/);
  const duration = durationMatch ? durationMatch[1] : 'unknown';

  // Extract individual test rows (ANSI already stripped).
  const testResults = [];
  let currentSuite = '';
  for (const line of output.split('\n')) {
    const suiteMatch = line.match(/(?:✓|×|❯|↓)?\s*([\w/.\\-]+\.test\.jsx?)/);
    if (suiteMatch) currentSuite = suiteMatch[1].trim();
    const passTest = line.match(/^\s*✓\s+(.+?)(\s+\d+ms)?\s*$/);
    const failTest = line.match(/^\s*×\s+(.+?)(\s+\d+ms)?\s*$/);
    if (passTest && !/\.test\.jsx?$/.test(passTest[1])) {
      testResults.push({ suite: currentSuite, name: passTest[1].trim(), status: 'pass', time: (passTest[2] || '').trim() });
    } else if (failTest && !/\.test\.jsx?$/.test(failTest[1])) {
      testResults.push({ suite: currentSuite, name: failTest[1].trim(), status: 'fail', time: (failTest[2] || '').trim() });
    }
  }

  // Extract failure details for the Gemini prompt.
  const failures = [];
  for (const section of output.split('FAIL ').slice(1)) {
    const errorMatch = section.match(/AssertionError:(.+?)(?:\n\n|\n\s*at)/s);
    if (errorMatch) failures.push(errorMatch[1].trim().substring(0, 200));
  }

  // Coverage from the json-summary reporter — produced by the --coverage run above
  // (full suite incl. tests/ai, so screen/hook smoke tests count toward coverage).
  let coverage = { available: false };
  const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(summaryPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      coverage = {
        available: true,
        total: data.total || {},
        files: Object.entries(data)
          .filter(([k]) => k !== 'total')
          .map(([file, stats]) => ({
            file: file.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, ''),
            statements: stats.statements?.pct ?? 0,
            branches: stats.branches?.pct ?? 0,
            functions: stats.functions?.pct ?? 0,
            lines: stats.lines?.pct ?? 0,
          }))
          .sort((a, b) => a.lines - b.lines),
      };
    } catch { coverage = { available: false }; }
  }

  return { output, passed, failed, skipped, total, duration, exitCode, testResults, failures, coverage };
}

// Count source files (excluding tests).
function countSourceFiles() {
  const srcDir = path.join(ROOT, 'src');
  const count = { jsx: 0, js: 0, total: 0 };
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.test\.jsx?$/.test(f)) continue; // not source
      else if (f.endsWith('.jsx')) count.jsx++;
      else if (f.endsWith('.js')) count.js++;
    }
  };
  walk(srcDir);
  count.total = count.jsx + count.js;
  return count;
}

// Count test files across BOTH src/ and tests/ (existing tests live in src/**).
function countTestFiles() {
  let count = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.test\.jsx?$/.test(f)) count++;
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'tests'));
  return count;
}

function generateHTML(testData, geminiAnalysis, sourceCount, testFileCount) {
  const { passed, failed, skipped, total, duration, testResults, coverage } = testData;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const statusEmoji = failed === 0 ? '✅' : '⚠️';
  const statusText = failed === 0 ? 'ALL TESTS PASSED' : `${failed} FAILURE${failed > 1 ? 'S' : ''} DETECTED`;
  const statusColor = failed === 0 ? '#16a34a' : '#ef4444';
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const coverageRows = coverage.available && coverage.files
    ? coverage.files.map(f => {
        const color = f.lines >= 80 ? '#16a34a' : f.lines >= 50 ? '#f97316' : '#ef4444';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:0.5px solid #1a2f4a;font-size:12px;color:#94a3b8;font-family:monospace">${esc(f.file)}</td>
          <td style="padding:8px 12px;border-bottom:0.5px solid #1a2f4a;text-align:center;color:${color};font-weight:600;font-size:13px">${f.lines}%</td>
          <td style="padding:8px 12px;border-bottom:0.5px solid #1a2f4a;text-align:center;font-size:12px;color:#94a3b8">${f.functions}%</td>
          <td style="padding:8px 12px;border-bottom:0.5px solid #1a2f4a;text-align:center;font-size:12px;color:#94a3b8">${f.branches}%</td>
        </tr>`;
      }).join('\n')
    : '';

  const testRows = testResults.map(t => {
    const icon = t.status === 'pass' ? '✓' : '✗';
    const color = t.status === 'pass' ? '#16a34a' : '#ef4444';
    return `<tr>
      <td style="padding:6px 12px;border-bottom:0.5px solid #1a2f4a;color:${color};font-size:13px;width:20px">${icon}</td>
      <td style="padding:6px 12px;border-bottom:0.5px solid #1a2f4a;font-size:12px;color:#f0f6ff">${esc(t.name)}</td>
      <td style="padding:6px 12px;border-bottom:0.5px solid #1a2f4a;font-size:11px;color:#4a6280;font-family:monospace">${esc(t.suite)}</td>
      <td style="padding:6px 12px;border-bottom:0.5px solid #1a2f4a;font-size:11px;color:#4a6280">${esc(t.time)}</td>
    </tr>`;
  }).join('\n');

  const totalCoverage = coverage.available && coverage.total?.lines
    ? `${coverage.total.lines.pct ?? 0}%` : 'N/A';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JanaShakti Test Report</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#080f1e; color:#94a3b8; }
.container { max-width:900px; margin:0 auto; padding:24px; }
.header { text-align:center; padding:32px 0; border-bottom:0.5px solid #1a2f4a; margin-bottom:24px; }
.logo { color:#00d4ff; font-size:24px; font-weight:800; margin-bottom:4px; }
.subtitle { color:#86efac; font-size:13px; margin-bottom:16px; }
.status-badge { display:inline-block; padding:8px 24px; border-radius:10px; font-size:14px; font-weight:600; }
.stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
.stat { background:#0d1b2e; border-radius:14px; border:0.5px solid #1a2f4a; padding:16px; text-align:center; }
.stat-value { font-size:28px; font-weight:700; }
.stat-label { font-size:11px; color:#4a6280; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px; }
.card { background:#0d1b2e; border-radius:14px; border:0.5px solid #1a2f4a; padding:20px; margin-bottom:16px; }
.card-title { font-size:15px; font-weight:600; color:#f0f6ff; margin-bottom:12px; }
.section-label { font-size:11px; font-weight:500; color:#4a6280; text-transform:uppercase; letter-spacing:0.7px; margin-bottom:12px; margin-top:24px; }
table { width:100%; border-collapse:collapse; }
th { padding:8px 12px; text-align:left; font-size:11px; color:#4a6280; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #1a2f4a; }
.progress-bar { height:6px; background:#1a2f4a; border-radius:3px; overflow:hidden; margin-top:8px; }
.progress-fill { height:100%; border-radius:3px; }
.ai-analysis { background:#112035; border-radius:10px; padding:16px; margin-top:12px; line-height:1.7; font-size:13px; white-space:pre-wrap; }
.footer { text-align:center; padding:24px 0; margin-top:32px; border-top:0.5px solid #1a2f4a; }
.timestamp { font-size:11px; color:#4a6280; }
.badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:600; }
</style>
</head>
<body>
<div class="container">

<div class="header">
  <div class="logo">JanaShakti</div>
  <div class="subtitle">जनशक्ति — Automated Test Report</div>
  <div class="status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">
    ${statusEmoji} ${statusText}
  </div>
</div>

<div class="stats">
  <div class="stat">
    <div class="stat-value" style="color:#00d4ff">${total}</div>
    <div class="stat-label">Total tests</div>
  </div>
  <div class="stat" style="border-top:3px solid #16a34a">
    <div class="stat-value" style="color:#16a34a">${passed}</div>
    <div class="stat-label">Passed</div>
  </div>
  <div class="stat" style="border-top:3px solid #ef4444">
    <div class="stat-value" style="color:#ef4444">${failed}</div>
    <div class="stat-label">Failed</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#f0f6ff">${passRate}%</div>
    <div class="stat-label">Pass rate</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${passRate}%;background:${passRate >= 80 ? '#16a34a' : passRate >= 50 ? '#f97316' : '#ef4444'}"></div>
    </div>
  </div>
</div>

<div class="stats" style="grid-template-columns:repeat(3,1fr)">
  <div class="stat">
    <div class="stat-value" style="color:#94a3b8;font-size:20px">${sourceCount.total}</div>
    <div class="stat-label">Source files</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#94a3b8;font-size:20px">${testFileCount}</div>
    <div class="stat-label">Test files</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#94a3b8;font-size:20px">${totalCoverage}</div>
    <div class="stat-label">Line coverage</div>
  </div>
</div>

<div class="section-label">Test results</div>
<div class="card">
  <table>
    <thead><tr><th></th><th>Test</th><th>Suite</th><th>Time</th></tr></thead>
    <tbody>${testRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#4a6280">No per-test rows captured (summary counts above are authoritative)</td></tr>'}</tbody>
  </table>
</div>

${coverage.available ? `
<div class="section-label">Coverage by file (lowest first)</div>
<div class="card">
  <table>
    <thead><tr><th>File</th><th style="text-align:center">Lines</th><th style="text-align:center">Functions</th><th style="text-align:center">Branches</th></tr></thead>
    <tbody>${coverageRows}</tbody>
  </table>
</div>
` : ''}

<div class="section-label">Gemini AI analysis</div>
<div class="card">
  <div class="card-title" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:16px">🤖</span> AI health assessment
    <span class="badge" style="background:#00d4ff20;color:#00d4ff">${MODEL_LABEL}</span>
  </div>
  <div class="ai-analysis">${esc(geminiAnalysis)}</div>
</div>

<div class="section-label">Test infrastructure</div>
<div class="card">
  <table>
    <tbody>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">Test runner</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">Vitest</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">Component testing</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">@testing-library/react</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">AI test generation</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">${MODEL_LABEL} (Agent 1)</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">AI failure analysis</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">${MODEL_LABEL} (Agent 2)</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">AI report generation</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">${MODEL_LABEL} (Agent 3)</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px;border-bottom:0.5px solid #1a2f4a">Environment</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px;border-bottom:0.5px solid #1a2f4a">jsdom</td></tr>
      <tr><td style="padding:6px 12px;color:#4a6280;font-size:12px">Duration</td><td style="padding:6px 12px;color:#f0f6ff;font-size:12px">${esc(duration)}</td></tr>
    </tbody>
  </table>
</div>

<div class="footer">
  <div class="logo" style="font-size:16px;margin-bottom:4px">JanaShakti Test Report</div>
  <div class="timestamp">Generated: ${now} IST${skipped ? ` · ${skipped} skipped` : ''}</div>
  <div class="timestamp" style="margin-top:4px">Powered by Google Gemini AI + Vitest</div>
</div>

</div>
</body>
</html>`;
}

async function main() {
  console.log('\n📊 JanaShakti Test Report Generator (Agent 3)');
  console.log('===============================================\n');

  console.log('1️⃣  Running tests + coverage...');
  const testData = runTestsWithCoverage();
  console.log(`   ${testData.passed} passed, ${testData.failed} failed, ${testData.skipped} skipped`);
  console.log(`   Coverage available: ${testData.coverage.available}`);

  const sourceCount = countSourceFiles();
  const testFileCount = countTestFiles();
  console.log(`   Source: ${sourceCount.total} files | Tests: ${testFileCount} files`);

  console.log('2️⃣  Asking Gemini for health assessment...');
  const geminiPrompt = `You are a senior QA engineer reviewing test results for JanaShakti, an AI-powered civic issue reporting platform built with React + Vite + Firebase + Gemini.

TEST RESULTS:
- Total: ${testData.total} tests
- Passed: ${testData.passed}
- Failed: ${testData.failed}
- Skipped: ${testData.skipped}
- Pass rate: ${testData.total > 0 ? Math.round((testData.passed / testData.total) * 100) : 0}%
- Duration: ${testData.duration}
- Source files: ${sourceCount.total} (${sourceCount.jsx} JSX + ${sourceCount.js} JS)
- Test files: ${testFileCount}
${testData.coverage.available ? `- Line coverage: ${testData.coverage.total?.lines?.pct ?? 'unknown'}%` : '- Coverage: not available'}

${testData.failures.length > 0 ? `FAILURES:\n${testData.failures.join('\n\n')}` : 'No failures.'}

Provide:
1. A 2-3 sentence health assessment of the test suite
2. Top 3 areas that need more test coverage (based on what a civic reporting app would need)
3. A risk assessment: what's the biggest untested risk for production deployment?
4. One specific recommendation for improving test quality

Keep it concise and actionable. Plain text, no markdown formatting.`;

  const geminiAnalysis = await callGemini(geminiPrompt);
  console.log('   Analysis complete.');

  console.log('3️⃣  Generating HTML + JSON report...');
  const html = generateHTML(testData, geminiAnalysis, sourceCount, testFileCount);

  const reportDir = path.join(ROOT, 'tests', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
  const htmlPath = path.join(reportDir, `test-report-${dateStr}.html`);
  const latestHtml = path.join(reportDir, 'latest.html');
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(latestHtml, html);

  const jsonReport = {
    timestamp: new Date().toISOString(),
    app: 'JanaShakti',
    version: '1.0.0',
    tests: {
      total: testData.total,
      passed: testData.passed,
      failed: testData.failed,
      skipped: testData.skipped,
      passRate: testData.total > 0 ? Math.round((testData.passed / testData.total) * 100) : 0,
      duration: testData.duration,
    },
    coverage: testData.coverage.available ? {
      lines: testData.coverage.total?.lines?.pct ?? 0,
      functions: testData.coverage.total?.functions?.pct ?? 0,
      branches: testData.coverage.total?.branches?.pct ?? 0,
      statements: testData.coverage.total?.statements?.pct ?? 0,
    } : null,
    source: { files: sourceCount.total, jsx: sourceCount.jsx, js: sourceCount.js },
    testFiles: testFileCount,
    aiAnalysis: geminiAnalysis,
    status: testData.failed === 0 ? 'PASS' : 'FAIL',
    generatedBy: `${MODEL_LABEL} (Agent 3)`,
  };
  fs.writeFileSync(path.join(reportDir, `report-${dateStr}.json`), JSON.stringify(jsonReport, null, 2));
  fs.writeFileSync(path.join(reportDir, 'latest.json'), JSON.stringify(jsonReport, null, 2));

  console.log('\n===============================================');
  console.log(`✅ HTML report: ${path.relative(ROOT, htmlPath)}`);
  console.log(`✅ JSON report: tests/reports/report-${dateStr}.json`);
  console.log(`✅ Latest:      tests/reports/latest.html`);
  console.log(`\nOpen in browser: file://${latestHtml.replace(/\\/g, '/')}`);
  console.log('===============================================\n');

  process.exit(testData.exitCode);
}

main().catch(console.error);
