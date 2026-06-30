import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { callGeminiText, logAgent } from '../utils/gemini';
import { runReActLoop } from './reactLoop';
import { NEARBY_GEO_BOUND, RECURRENCE_WINDOW_DAYS } from '../constants/issueTypes';

// Firestore Timestamp | ISO string | millis → epoch millis (or null if unparseable).
const toMillis = (ts) => {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
};

// ── Agent 2 (recurrence half): a RESOLVED issue that came back ──────────────────
// Looks for an issue of the SAME type at the SAME place (±NEARBY_GEO_BOUND) that was
// marked Resolved within the last RECURRENCE_WINDOW_DAYS. If found, the new report is
// not a duplicate (the old one is closed) — it's a recurrence: the earlier fix did not
// hold. Returns the prior complaint so the authority email + issue page can call it out.
// Deterministic (no AI): "same type, same spot, recently closed" IS the recurrence grain.
export const checkRecurrence = async (newIssue) => {
  try {
    const { lat, lng } = newIssue.location || {};
    if (!lat || !lng) return { isRecurrence: false };

    const snap = await getDocs(
      query(collection(db, 'issues'),
        where('status', '==', 'Resolved'),
        where('issueType', '==', newIssue.issueType),
      )
    );

    const now = Date.now();
    const windowMs = RECURRENCE_WINDOW_DAYS * 86400000;

    const candidates = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .map(i => ({ ...i, resolvedMs: toMillis(i.resolvedAt) }))
      .filter(i => i.location && i.resolvedMs
        && Math.abs(i.location.lat - lat) < NEARBY_GEO_BOUND
        && Math.abs(i.location.lng - lng) < NEARBY_GEO_BOUND
        && now - i.resolvedMs >= 0
        && now - i.resolvedMs <= windowMs)
      // Most recently resolved first — that's the fix that just failed.
      .sort((a, b) => b.resolvedMs - a.resolvedMs);

    if (candidates.length === 0) return { isRecurrence: false };

    const prior = candidates[0];
    return {
      isRecurrence: true,
      priorIssueId: prior.id,
      priorComplaintId: prior.complaintId || null,
      resolvedAtISO: new Date(prior.resolvedMs).toISOString(),
      daysSinceResolved: Math.round((now - prior.resolvedMs) / 86400000),
      // Chain count: a 2nd recurrence of the same spot reads #3, etc.
      recurrenceCount: (prior.recurrenceCount || 0) + 1,
    };
  } catch (err) {
    console.error('[checkRecurrence]:', err);
    return { isRecurrence: false };
  }
};

// ── Agent 2 (duplicate half): now a bounded ReAct loop ──────────────────────────
// Was a single similarity prompt against the nearest neighbour. Now the agent scans a
// tight radius, then reasons step by step: compare a candidate (Gemini similarity),
// adaptively WIDEN the search if it wants more context, and only then decide. Same
// { isDuplicate, existingIssueId, similarity } output every caller expects, plus a
// `trace`. (When nothing is nearby it returns immediately with zero AI calls — the
// common case stays fast.)

const DUPLICATE_THRESHOLD = 65;
const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 48);

// Same query the detector always used (open same-type issues), parameterised by radius.
const searchNearby = async (newIssue, issueId, radius) => {
  const { lat, lng } = newIssue.location || {};
  const snap = await getDocs(
    query(collection(db, 'issues'),
      where('status', 'in', ['Reported', 'Verified', 'In Progress', 'Needs Verification']),
      where('issueType', '==', newIssue.issueType),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => i.location
      && Math.abs(i.location.lat - lat) < radius
      && Math.abs(i.location.lng - lng) < radius
      && i.id !== issueId)
    .map((i) => ({
      id: i.id,
      description: i.description || '',
      meters: Math.round(Math.hypot(i.location.lat - lat, i.location.lng - lng) * 111000),
    }));
};

const DETECTOR_FN = {
  name: 'duplicate_step',
  description: 'Choose the next step to determine whether this new report duplicates an existing open one nearby.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        enum: ['compare', 'search_wider', 'decide'],
        description: 'the single next step',
      },
      reasoning: { type: 'STRING', description: 'one sentence: why this step' },
      candidateIndex: { type: 'NUMBER', description: 'which listed candidate to compare (0-based), for action=compare' },
      isDuplicate: { type: 'BOOLEAN', description: 'for action=decide' },
      existingIndex: { type: 'NUMBER', description: 'index of the matched candidate, for action=decide when isDuplicate' },
      similarity: { type: 'NUMBER', description: '0-100 similarity of the best match, for action=decide' },
    },
    required: ['action', 'reasoning'],
  },
};

const ACTION_LABEL = {
  compare: 'Compare candidate',
  search_wider: 'Widen the search',
  decide: 'Decide',
};

export const checkDuplicate = async (newIssue, issueId) => {
  const startTime = Date.now();
  try {
    const { lat, lng } = newIssue.location || {};
    if (!lat || !lng) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return { isDuplicate: false, existingIssueId: null, trace: [] };
    }

    // Tight scan first — if nothing is nearby this is unique with zero AI spend.
    const candidates = await searchNearby(newIssue, issueId, NEARBY_GEO_BOUND);
    if (candidates.length === 0) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return {
        isDuplicate: false, existingIssueId: null,
        trace: [{
          agent: 'detector', action: 'scan', name: 'Scan nearby', status: 'done',
          summary: `Scanned ~200m for open ${newIssue.issueType} reports`,
          detail: 'No similar open reports nearby — unique.',
        }],
      };
    }

    const ctx = { candidates, comparisons: {}, widened: false };

    const buildPrompt = (history, c, meta) => {
      const list = c.candidates
        .map((cand, i) => `  [${i}] (${cand.meters}m) "${short(cand.description)}"`)
        .join('\n');
      let p = `You are the Duplicate Detector for JanaShakti, India's civic platform.
Decide whether this NEW report is a duplicate of an existing OPEN report nearby.

NEW REPORT: "${newIssue.description || '—'}" (${newIssue.issueType})

NEARBY OPEN CANDIDATES:
${list}

ACTIONS
- compare: run an AI similarity check of the new report against one candidate (set candidateIndex).
- search_wider: broaden the radius to surface more candidates (use once if the list looks incomplete).
- decide: conclude. Set isDuplicate, and when true set existingIndex (the matched candidate) and similarity.

RULES
- Compare the most plausible candidate(s) BEFORE deciding. Only call something a duplicate when it is clearly the same problem at the same place.
- Never repeat a comparison you already did.`;
      if (history.length) {
        p += `\n\nOBSERVED SO FAR:\n` + history.map((h, i) => `${i + 1}. ${h.action} → ${h.observation}`).join('\n');
      }
      if (meta.isLast) p += `\n\nThis is your LAST step — choose decide now.`;
      return p;
    };

    const runTool = async (action, decision, c) => {
      switch (action) {
        case 'compare': {
          const i = Number.isInteger(decision?.candidateIndex) ? decision.candidateIndex : 0;
          const cand = c.candidates[i];
          if (!cand) return { observation: `No candidate at index ${i}.` };
          const prompt = `Are these two civic issue reports describing the same problem?

Report A (new): "${newIssue.description}"
Report B (existing): "${cand.description}"
Both are: ${newIssue.issueType} in the same area.

Return ONLY valid JSON:
{ "isDuplicate": true, "similarity": 85, "reasoning": "one sentence explanation" }`;
          const r = await callGeminiText(prompt);
          c.comparisons[i] = { similarity: r.similarity ?? 0, isDuplicate: !!r.isDuplicate, reasoning: r.reasoning || '' };
          return { observation: `Candidate ${i} ("${short(cand.description)}"): ${r.similarity ?? 0}% — ${r.reasoning || ''}` };
        }
        case 'search_wider': {
          if (c.widened) return { observation: 'Already widened once — work with the current candidates.' };
          c.widened = true;
          const wider = await searchNearby(newIssue, issueId, NEARBY_GEO_BOUND * 2);
          const seen = new Set(c.candidates.map((x) => x.id));
          wider.forEach((x) => { if (!seen.has(x.id)) c.candidates.push(x); });
          return { observation: `Widened to ~400m: ${c.candidates.length} candidate(s) now.` };
        }
        case 'decide': {
          const idx = Number.isInteger(decision?.existingIndex) ? decision.existingIndex : 0;
          const cand = c.candidates[idx];
          const similarity = decision?.similarity ?? 0;
          const isDup = !!decision?.isDuplicate && similarity > DUPLICATE_THRESHOLD && !!cand;
          return {
            observation: isDup
              ? `Duplicate of candidate ${idx} ("${short(cand.description)}") at ${similarity}%.`
              : 'Not a duplicate — distinct from nearby reports.',
            done: true,
            result: { isDuplicate: isDup, existingIssueId: isDup ? cand.id : null, similarity },
          };
        }
        default:
          return { observation: `Unknown step "${action}".` };
      }
    };

    const { trace, result } = await runReActLoop({
      fnDeclaration: DETECTOR_FN,
      buildPrompt,
      runTool,
      maxIterations: 3,
      agentKey: 'detector',
      agentName: 'Duplicate Detector',
      labelFor: (action) => ACTION_LABEL[action] || 'Duplicate Detector',
      ctx,
    });

    // The model may stop without an explicit decision — fall back to the best comparison.
    let output = result;
    if (!output) {
      let best = null;
      Object.entries(ctx.comparisons).forEach(([i, comp]) => {
        if (!best || (comp.similarity || 0) > (best.comp.similarity || 0)) best = { i: Number(i), comp };
      });
      const isDup = !!best && (best.comp.similarity || 0) > DUPLICATE_THRESHOLD;
      output = {
        isDuplicate: isDup,
        existingIssueId: isDup ? ctx.candidates[best.i]?.id || null : null,
        similarity: best?.comp.similarity || 0,
      };
    }

    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output,
      processingTimeMs: Date.now() - startTime, success: true });
    return { ...output, trace };
  } catch (err) {
    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message });
    return { isDuplicate: false, existingIssueId: null, trace: [] };
  }
};
