import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { isProxyEnabled, fetchViaProxy } from './aiProxy';
import { buildRTIApplication, formatINDate } from './rti';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Current supported models (verified 200 OK against this key, June 2026).
// Ordered most-reliable first; the chain falls through on 404/429/503.
const MODEL_CHAIN = [
  'gemini-2.5-flash',        // current, reliable, great quality
  'gemini-2.5-flash-lite',   // cheaper, current fallback
  'gemini-2.0-flash',        // older fallback
];

const buildUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Compress image before sending — saves quota significantly
export const compressImage = (base64, maxWidth = 640, quality = 0.4) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      resolve(compressed);
    };
    img.onerror = () => resolve(base64);
    img.src = 'data:image/jpeg;base64,' + base64;
  });
};

let lastUsedModel = MODEL_CHAIN[0];

const fetchGemini = async (body) => {
  for (const model of MODEL_CHAIN) {
    try {
      const res = await fetch(buildUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: body }],
          generationConfig: { temperature: 0.1, topK: 1, topP: 0.95 },
        }),
      });

      // Rate limited — try next model immediately (no retry on same model)
      if (res.status === 429) {
        console.error(`[Gemini] 429 on ${model}, trying next...`);
        continue;
      }

      // Model gone or unavailable — skip
      if (res.status === 404 || res.status === 503) {
        console.error(`[Gemini] ${res.status} on ${model}, skipping`);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from ' + model);

      lastUsedModel = model;
      console.info(`[Gemini] SUCCESS with ${model}`);
      return text.replace(/```json|```/g, '').trim();

    } catch (err) {
      console.error(`[Gemini] ${model} error:`, err.message);
    }
  }

  throw new Error(
    'All Gemini models failed. Fix: go to aistudio.google.com/apikey → create a NEW key → paste in .env → restart server.'
  );
};

export const getLastModel = () => lastUsedModel;

// Unified AI dispatch. Takes Gemini-style "parts" and returns cleaned raw text,
// so all callers stay agnostic of where the call is served.
// Priority: n8n proxy (key server-side) → direct Gemini.
const fetchAI = async (parts) => {
  if (isProxyEnabled()) {
    lastUsedModel = 'gemini (proxy)';
    return await fetchViaProxy(parts);
  }
  return await fetchGemini(parts);
};

export const callGeminiText = async (prompt) => {
  const raw = await fetchAI([{ text: prompt }]);
  return JSON.parse(raw);
};

// Plain-text Gemini call — returns the model's text as-is (no JSON.parse). Used by
// the voice assistant, which needs conversational prose. Still routes through
// fetchAI (provider switch + model chain), per the CLAUDE.md "all AI via fetchAI" rule.
export const callGeminiPlainText = async (prompt) => {
  return await fetchAI([{ text: prompt }]);
};

export const callGeminiVision = async (prompt, base64Image) => {
  const compressed = await compressImage(base64Image);
  const raw = await fetchAI([
    { text: prompt },
    { inline_data: { mime_type: 'image/jpeg', data: compressed } },
  ]);
  return JSON.parse(raw);
};

// ── Gemini function calling (native tool use) ───────────────────────────────────
// Forces Gemini to return typed arguments matching `declaration` (a Gemini
// FunctionDeclaration) instead of JSON-in-prose, so there's no fence-stripping or
// JSON.parse step. Only the direct Gemini provider is supported — callers should
// catch and fall back to the prompt-based JSON path (callGeminiText/Vision).
const fetchGeminiFunction = async (declaration, parts) => {
  for (const model of MODEL_CHAIN) {
    try {
      const res = await fetch(buildUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          tools: [{ functionDeclarations: [declaration] }],
          toolConfig: {
            functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [declaration.name] },
          },
          generationConfig: { temperature: 0.1 },
        }),
      });

      if (res.status === 429 || res.status === 404 || res.status === 503) {
        console.error(`[Gemini fn] ${res.status} on ${model}, trying next...`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const call = data.candidates?.[0]?.content?.parts
        ?.find((p) => p.functionCall)?.functionCall;
      if (!call?.args) throw new Error('No functionCall in response from ' + model);

      lastUsedModel = model;
      console.info(`[Gemini fn] SUCCESS with ${model} → ${call.name}`);
      return call.args;
    } catch (err) {
      console.error(`[Gemini fn] ${model} error:`, err.message);
    }
  }
  throw new Error('All Gemini models failed (function calling)');
};

// Function calling needs the direct Gemini endpoint. When routing through the n8n
// proxy (which returns text only) this throws so the caller falls back to its JSON path.
const ensureGeminiProvider = () => {
  if (isProxyEnabled()) throw new Error('function-calling: unsupported via proxy');
};

export const callGeminiFunction = async (declaration, prompt) => {
  ensureGeminiProvider();
  return await fetchGeminiFunction(declaration, [{ text: prompt }]);
};

export const callGeminiVisionFunction = async (declaration, prompt, base64Image) => {
  ensureGeminiProvider();
  const compressed = await compressImage(base64Image);
  return await fetchGeminiFunction(declaration, [
    { text: prompt },
    { inline_data: { mime_type: 'image/jpeg', data: compressed } },
  ]);
};

export const logAgent = async (data) => {
  try {
    await addDoc(collection(db, 'agents_log'), {
      ...data,
      geminiModel: lastUsedModel,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[logAgent]:', e.message);
  }
};

export const generateXCaption = async (issue) => {
  const prompt = `Generate a Twitter/X post for @JanaShaktiApp civic platform.
Issue: ${issue.issueType} at ${issue.locationText}.
Severity: ${issue.severity}. ${issue.confirmations || 0} citizens confirmed.
Tag relevant Indian civic authority handles. Under 260 characters.
Include #JanaShakti and city hashtag.
Return ONLY the tweet text, no JSON.`;
  return await fetchAI([{ text: prompt }]);
};

export const generateRTI = async (issue) => {
  // The document is assembled deterministically by buildRTIApplication so every
  // identity / location / reference / date field binds to real issue data (no
  // duplication, no unfilled [placeholders]). The AI tailors ONLY the list of
  // information points to the issue type — and we fall back to a generic-but-valid
  // list if that call fails.
  const department = issue.department || issue.routedTo?.departmentName || 'Municipal Corporation';

  let infoPoints = [];
  try {
    const prompt = `For an RTI (Right to Information Act, 2005) application about an
unresolved "${issue.issueType}" civic issue in India handled by the "${department}",
list 5 to 6 specific items of information a citizen should request to compel action
(for example: work orders, budget allocated and expenditure, contractor/agency
details, inspection reports, resolution timeline, reasons for delay).
Return ONLY a JSON array of plain-text strings, with no numbering and no extra keys.`;
    const arr = await callGeminiText(prompt);
    if (Array.isArray(arr)) infoPoints = arr.filter((p) => typeof p === 'string' && p.trim());
  } catch (err) {
    console.error('[generateRTI points]:', err);
  }

  return buildRTIApplication({
    name: issue.userName,
    email: issue.userEmail,
    address: issue.locationText,
    city: issue.city,
    issueType: issue.issueType,
    department,
    complaintId: issue.complaintId,
    reportedOn: formatINDate(issue.createdAt),
    infoPoints,
  });
};

export const generateCityInsights = async (issuesSummary) => {
  const prompt = `Analyze these civic issue patterns from JanaShakti platform:
${JSON.stringify(issuesSummary)}

Return ONLY valid JSON array of 4 insight objects:
[
  { "icon": "AlertTriangle", "color": "#ef4444",
    "title": "short insight title", "body": "one sentence" }
]
Use Lucide icon names only. Colors: #ef4444 #f97316 #eab308 #22c55e #3b82f6`;
  return await callGeminiText(prompt);
};