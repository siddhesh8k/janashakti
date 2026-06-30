import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { callGeminiFunction, callGeminiText, generateRTI, logAgent } from '../utils/gemini';
import { checkAndEscalate, getEscalationInfo } from '../utils/escalation';
import { routeToAuthority } from './authorityRouter';
import { markNeedsVerification } from '../utils/collaboration';
import { ESCALATION_LEVELS } from '../constants/issueTypes';

// ── Agent 7: Resolution Coordinator ─────────────────────────────────────────────
// Unlike Agents 1–6 (each a single Gemini call sequenced by the orchestrator), this is
// a TRUE autonomous agent: a bounded ReAct loop. Each turn it is given the issue's live
// state plus the history of actions it has already taken and their REAL observed results,
// and it chooses ONE next tool — escalate / draft RTI / re-route / request verification /
// wait / done. The tool runs for real, its result is fed back, and the agent decides
// again — adapting to what actually happened (e.g. pivoting when escalation is no longer
// possible). Every decision's reasoning is surfaced live via onStep and persisted.

const MAX_ITERATIONS = 4;
const MAX_LEVEL = ESCALATION_LEVELS.length - 1; // top escalation tier (Media & Public Alert)
const MUTATING = ['escalate', 'draft_rti', 'reroute', 'request_verification'];

// Forced single-function call: Gemini returns typed args matching this schema.
const COORDINATOR_FN = {
  name: 'decide_next_action',
  description: 'Choose the single best next action to move this stalled civic issue toward resolution.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        enum: ['escalate', 'draft_rti', 'reroute', 'request_verification', 'wait', 'done'],
        description: 'the single best next action given the current state and prior observations',
      },
      reasoning: { type: 'STRING', description: 'one or two sentences: WHY this action, citing the state' },
      expected_outcome: { type: 'STRING', description: 'what you expect this action to achieve' },
    },
    required: ['action', 'reasoning'],
  },
};

const ACTION_LABEL = {
  escalate: 'Escalate',
  draft_rti: 'Draft RTI application',
  reroute: 'Re-route to department',
  request_verification: 'Request community verification',
  wait: 'Hold & monitor',
  done: 'Plan complete',
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);

// Build the per-turn prompt: live state + the action menu + everything observed so far.
const buildContext = (issue, escInfo, history) => {
  const evidenceCount = issue.evidenceCount
    ?? (issue.contributors || []).reduce((n, c) => n + (c.evidenceCount || 0), 0);
  const recurrenceLine = issue.recurrenceOf
    ? `- RECURRENCE: this issue was resolved ${issue.recurrenceDaysSince ?? '?'}d ago but came back (occurrence #${issue.recurrenceCount ?? 2}) — the earlier fix did not hold.`
    : '- Recurrence: none';

  let ctx = `You are the Resolution Coordinator for JanaShakti, India's civic accountability platform.
Decide the single best NEXT action to push this civic issue toward resolution.

ISSUE STATE
- Type: ${issue.issueType} · Severity: ${issue.severity}
- Status: ${issue.status}
- Days open: ${escInfo.daysOpen}
- Escalation tier: ${escInfo.currentLevel}/${MAX_LEVEL} (${escInfo.currentAuthority})${
    escInfo.nextAuthority
      ? ` · next tier ${escInfo.nextAuthority} due in ${escInfo.daysUntilNextEscalation}d`
      : ' · already at the TOP tier'
  }
- Community confirmations: ${issue.confirmations || 0}
- Contributors: ${(issue.contributors || []).length} · Evidence items: ${evidenceCount}
- Routed to: ${issue.routedTo?.departmentName || 'not yet routed'}${
    issue.routedTo?.slaHours ? ` (SLA ${issue.routedTo.slaHours}h)` : ''
  }
- Prediction: priority ${issue.prediction?.priority_score ?? '—'}/100, ~${issue.prediction?.predicted_days ?? '—'}d, escalation risk ${issue.prediction?.escalation_risk || '—'}
${recurrenceLine}

ACTIONS
- escalate: bump to the next authority tier and notify them. Only when overdue AND not already at the top tier.
- draft_rti: draft a Right-to-Information application to legally compel disclosure. Use for long-overdue or recurring issues.
- reroute: re-send to the correct department. Use if mis-routed or the department is wrong/unknown.
- request_verification: move to community verification. Use when it may already be fixed on the ground.
- wait: hold and monitor — the correct call for a fresh issue still within its SLA.
- done: the plan is complete; stop.

RULES
- Pick exactly ONE action that best fits the CURRENT state and everything observed so far.
- Never repeat an action already performed this run.
- Prefer 'wait' or 'done' over an action that does not clearly help.`;

  if (history.length) {
    ctx += `\n\nACTIONS ALREADY PERFORMED THIS RUN:\n` +
      history.map((h, i) => `${i + 1}. ${h.action} → ${h.observation}`).join('\n');
  }
  return ctx;
};

// One decision: native function-calling first, JSON-in-prose fallback (proxy / fn failure).
const decide = async (prompt) => {
  try {
    return await withTimeout(callGeminiFunction(COORDINATOR_FN, prompt), 20000, 'Coordinator decision');
  } catch (fnErr) {
    console.error('[coordinator fn → JSON fallback]:', fnErr.message);
    const jsonPrompt = `${prompt}

Return ONLY valid JSON:
{ "action": "escalate | draft_rti | reroute | request_verification | wait | done", "reasoning": "...", "expected_outcome": "..." }`;
    return await withTimeout(callGeminiText(jsonPrompt), 20000, 'Coordinator decision (json)');
  }
};

// Execute the chosen tool for real. Mutates `issue` in place so the next turn reflects
// the new state. Returns the observation string fed back into the loop.
const runTool = async (action, issue, user) => {
  try {
    switch (action) {
      case 'escalate': {
        if ((issue.escalationLevel || 0) >= MAX_LEVEL) {
          return 'No escalation possible — already at the top tier (Media & Public Alert).';
        }
        const r = await checkAndEscalate(issue);
        if (r?.escalated) {
          issue.escalationLevel = r.to;
          issue.wallOfShame = r.daysOpen >= 30;
          return `Escalated to ${r.escalatedTo} (tier ${r.to}) after ${r.daysOpen}d open — authority notified.`;
        }
        return 'Escalation not yet due — the issue is still within the current tier window.';
      }
      case 'draft_rti': {
        const letter = await generateRTI(issue);
        const text = typeof letter === 'string' ? letter : '';
        issue.__rtiDraft = text; // stashed for persistence under coordination.rtiDraft
        return `RTI application drafted (${text.length} chars) and saved to this issue.`;
      }
      case 'reroute': {
        const routing = await routeToAuthority(issue, issue.id);
        // Write ONLY routedTo + updatedAt so the authority-context rules `hasOnly` check passes.
        await updateDoc(doc(db, 'issues', issue.id), { routedTo: routing, updatedAt: serverTimestamp() });
        issue.routedTo = routing;
        return `Re-routed to ${routing?.departmentName || 'department'} (${routing?.urgencyLevel || 'Routine'}, SLA ${routing?.slaHours ?? '—'}h${routing?.emailSent ? ', email sent' : ''}).`;
      }
      case 'request_verification': {
        const res = await markNeedsVerification(issue.id, user);
        if (res?.ok) {
          issue.status = 'Needs Verification';
          return 'Moved to Needs Verification — the community will confirm whether it is fixed.';
        }
        return `Could not request verification: ${res?.error || 'unknown error'}.`;
      }
      case 'wait':
        return 'Holding — no action needed right now; the issue will be monitored.';
      default:
        return '';
    }
  } catch (err) {
    console.error('[coordinator tool]:', action, err.message);
    return `Action "${action}" failed: ${err.message}. Choosing a different approach.`;
  }
};

// Run the autonomous coordination loop over a single issue.
// `onStep(stepsSnapshot)` streams the live reasoning trace to the UI (same shape the
// Agents Showcase renders). Returns { actions, summary, steps }.
export const coordinateResolution = async (issue, { user, onStep } = {}) => {
  const startedAt = Date.now();
  if (!issue?.id) return { actions: [], summary: 'No issue to coordinate.', steps: [], error: 'missing issue' };

  const steps = [];
  const emit = (i, patch) => {
    steps[i] = { ...(steps[i] || { agent: 'coordinator' }), ...patch };
    if (onStep) onStep(steps.map((s) => ({ ...s })));
  };

  const history = [];   // { action, reasoning, observation }
  const used = new Set();
  let rtiDraft = null;
  let finalReasoning = '';

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const escInfo = getEscalationInfo(issue);
      const prompt = buildContext(issue, escInfo, history);

      let decision;
      try {
        decision = await decide(prompt);
      } catch (e) {
        emit(steps.length, {
          agent: 'coordinator', name: 'Coordinator', status: 'error',
          summary: 'Could not reach the reasoning model.', detail: e.message,
        });
        break;
      }

      let action = decision?.action;
      const reasoning = decision?.reasoning || '';
      if (!ACTION_LABEL[action]) action = 'done';                       // guard: invalid → stop
      if (MUTATING.includes(action) && used.has(action)) action = 'done'; // guard: no repeats

      const idx = steps.length;
      emit(idx, { agent: 'coordinator', action, name: ACTION_LABEL[action], status: 'running', summary: reasoning });

      // Terminal decisions: record reasoning and stop.
      if (action === 'done' || action === 'wait') {
        const observation = action === 'wait'
          ? 'Holding — no action needed right now; the issue will be monitored.'
          : 'Plan complete.';
        emit(idx, { status: 'done', detail: observation });
        history.push({ action, reasoning, observation });
        finalReasoning = reasoning || observation;
        break;
      }

      // Act → observe.
      const observation = await runTool(action, issue, user);
      used.add(action);
      if (action === 'draft_rti' && issue.__rtiDraft) rtiDraft = issue.__rtiDraft;
      emit(idx, { status: 'done', detail: observation });
      history.push({ action, reasoning, observation });
      finalReasoning = reasoning;

      if (i === MAX_ITERATIONS - 1) {
        // Hit the cap — record an explicit close so the trace reads cleanly.
        const j = steps.length;
        emit(j, { agent: 'coordinator', action: 'done', name: ACTION_LABEL.done, status: 'done',
          summary: 'Reached the action limit for this run.', detail: 'Plan complete.' });
      }
    }

    const performed = history.filter((h) => MUTATING.includes(h.action));
    const summary = performed.length
      ? `Took ${performed.length} action${performed.length > 1 ? 's' : ''}: ${performed.map((h) => ACTION_LABEL[h.action]).join(', ')}.`
      : (finalReasoning || 'No action needed — issue is on track.');

    const durationMs = Date.now() - startedAt;
    const coordination = {
      ranAt: serverTimestamp(),
      ranByUid: user?.uid || null,
      actions: history.map((h) => ({ action: h.action, reasoning: h.reasoning, observation: h.observation, at: new Date().toISOString() })),
      summary,
      ...(rtiDraft ? { rtiDraft } : {}),
    };

    // Persist the run onto the issue (single new field) — best-effort.
    try { await updateDoc(doc(db, 'issues', issue.id), { coordination }); }
    catch (e) { console.error('[coordinator/persist]:', e.message); }

    // Queryable trace for the Agents Showcase.
    try {
      await addDoc(collection(db, 'agent_runs'), {
        issueId: issue.id,
        issueType: issue.issueType || 'Issue',
        severity: issue.severity || '',
        locationText: issue.locationText || '',
        steps,
        durationMs,
        kind: 'coordinator',
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.error('[coordinator/run-log]:', e.message); }

    await logAgent({
      issueId: issue.id,
      agentName: 'resolution_coordinator',
      input: { status: issue.status, daysOpen: getEscalationInfo(issue).daysOpen, escalationLevel: issue.escalationLevel || 0 },
      output: { actions: coordination.actions, summary },
      processingTimeMs: durationMs,
      success: true,
    });

    return { actions: history, summary, steps, rtiDraft };
  } catch (err) {
    console.error('[coordinateResolution]:', err);
    await logAgent({
      issueId: issue.id, agentName: 'resolution_coordinator',
      input: { status: issue.status }, output: null,
      processingTimeMs: Date.now() - startedAt, success: false, error: err.message,
    });
    return { actions: history, summary: 'Coordinator run failed.', steps, error: err.message };
  }
};
