import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { checkDuplicate, checkRecurrence } from './duplicateDetector';
import { routeToAuthority } from './authorityRouter';
import { predictResolution } from './resolutionPredictor';

// Guard every awaited agent so one slow AI call can't freeze the submit flow.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);

// ── The JanaShakti agent orchestrator ──────────────────────────────────────────
// Runs the four agents as ONE coordinated pipeline rather than independent calls:
//   1. surfaces Agent 1's analysis (already produced at capture) in the trace,
//   2. runs Agent 2 (duplicate) and short-circuits if it's a duplicate,
//   3. saves the issue (via the caller's saveIssue callback),
//   4. runs Agent 3 (router), then feeds ITS OUTPUT into Agent 4 (predictor) so the
//      prediction uses the real routed department/SLA (this is the collaboration —
//      and it fixes the old bug where Agent 4 always saw department "Unknown"),
//   5. persists routedTo + prediction onto the issue (sequenced, no race),
//   6. writes a queryable per-issue summary to `agent_runs` for the Showcase traces.
// `onStep(stepsSnapshot)` is invoked after every state change so the UI can render
// the agents reasoning live. Returns the full run object.
export const orchestrateIssue = async ({ analysis, issueData, tempId, onStep, saveIssue }) => {
  const steps = [];
  const startedAt = Date.now();

  // Upsert a step by agent key, then notify the caller with an immutable snapshot.
  const emit = (patch) => {
    const i = steps.findIndex((s) => s.agent === patch.agent);
    if (i >= 0) steps[i] = { ...steps[i], ...patch };
    else steps.push({ ...patch });
    if (onStep) onStep(steps.map((s) => ({ ...s })));
  };

  // ── Agent 1: Analyzer (ran at capture) — show it, including any self-retry ──
  emit({
    agent: 'analyzer', name: 'Issue Analyzer', status: 'done',
    summary: `${analysis?.issue_type || 'Issue'} · ${analysis?.severity || '—'}`,
    detail: analysis?.retried
      ? `Self-checked: re-evaluated low confidence → ${analysis?.confidence ?? 0}%`
      : `Confidence ${analysis?.confidence ?? 0}%`,
    confidence: analysis?.confidence ?? null,
  });

  // ── Agent 2: Duplicate Detector ──
  emit({ agent: 'detector', name: 'Duplicate Detector', status: 'running', summary: 'Scanning 200m radius…' });
  let duplicate = { isDuplicate: false, existingIssueId: null };
  try {
    duplicate = await withTimeout(checkDuplicate(issueData, tempId), 10000, 'Duplicate check');
  } catch (e) {
    console.error('[Orchestrator/detector]:', e);
  }
  if (duplicate.isDuplicate && duplicate.existingIssueId) {
    emit({
      agent: 'detector', status: 'done',
      summary: `Duplicate found (${duplicate.similarity ?? 0}% match)`,
      detail: 'Routing your confirmation to the existing report.',
    });
    // Caller owns the confirm/redirect path. Nothing is saved.
    return { duplicate, analysis, routing: null, prediction: null, steps, docId: null, finishedAt: Date.now() };
  }
  // ── Agent 2 (recurrence half): did a RESOLVED issue come back here within a year? ──
  let issueToSave = issueData;
  let recurrence = { isRecurrence: false };
  try {
    const r = await withTimeout(checkRecurrence(issueData), 10000, 'Recurrence check');
    if (r) recurrence = r;
  } catch (e) {
    console.error('[Orchestrator/recurrence]:', e);
  }
  if (recurrence.isRecurrence) {
    issueToSave = {
      ...issueData,
      recurrenceOf: recurrence.priorIssueId,
      recurrenceOfComplaintId: recurrence.priorComplaintId,
      recurrenceResolvedAt: recurrence.resolvedAtISO,
      recurrenceDaysSince: recurrence.daysSinceResolved,
      recurrenceCount: recurrence.recurrenceCount,
    };
    emit({
      agent: 'detector', status: 'done',
      summary: `Recurrence of a resolved issue (#${recurrence.recurrenceCount})`,
      detail: `Previously resolved ${recurrence.daysSinceResolved}d ago${recurrence.priorComplaintId ? ` · ${recurrence.priorComplaintId}` : ''} — the earlier fix did not hold. Flagged for the authority.`,
    });
  } else {
    emit({ agent: 'detector', status: 'done', summary: 'No duplicate — new report', detail: 'Unique within 200m.' });
  }

  // ── Save the issue (caller's addDoc) → docId ──
  const docId = await saveIssue(issueToSave);

  // ── Agent 3: Authority Router ──
  emit({ agent: 'router', name: 'Authority Router', status: 'running', summary: 'Routing to department…' });
  let routing = null;
  try {
    routing = await withTimeout(routeToAuthority(issueToSave, docId), 20000, 'Authority routing');
    emit({
      agent: 'router', status: 'done',
      summary: routing?.departmentName || 'Department notified',
      detail: `${routing?.urgencyLevel || 'Routine'} · SLA ${routing?.slaHours ?? '—'}h${routing?.emailSent ? ' · email sent' : ''}`,
    });
  } catch (e) {
    console.error('[Orchestrator/router]:', e);
    emit({ agent: 'router', status: 'error', summary: 'Routing failed', detail: 'Can be retried from the issue page.' });
  }

  // ── Agent 4: Resolution Predictor — receives Agent 3's output (context passing) ──
  emit({ agent: 'predictor', name: 'Resolution Predictor', status: 'running', summary: 'Predicting resolution…' });
  let prediction = null;
  try {
    prediction = await withTimeout(
      predictResolution({ ...issueToSave, id: docId, routedTo: routing || issueToSave.routedTo }, docId),
      20000, 'Resolution prediction',
    );
    emit({
      agent: 'predictor', status: 'done',
      summary: `~${prediction?.predicted_days ?? '—'} days · priority ${prediction?.priority_score ?? '—'}`,
      detail: prediction?.recommendation || '',
      confidence: prediction?.confidence ?? null,
    });
  } catch (e) {
    console.error('[Orchestrator/predictor]:', e);
    emit({ agent: 'predictor', status: 'error', summary: 'Prediction failed', detail: '' });
  }

  // ── Persist agent outputs onto the issue (sequenced + awaited — no fire-and-forget race) ──
  const updates = {};
  if (routing) updates.routedTo = routing;
  if (prediction) updates.prediction = prediction;
  if (Object.keys(updates).length) {
    try { await updateDoc(doc(db, 'issues', docId), updates); }
    catch (e) { console.error('[Orchestrator/persist]:', e); }
  }

  const finishedAt = Date.now();

  // ── Queryable run summary for the Agents Showcase reasoning traces ──
  try {
    await addDoc(collection(db, 'agent_runs'), {
      issueId: docId,
      issueType: issueData.issueType || 'Issue',
      severity: issueData.severity || '',
      locationText: issueData.locationText || '',
      steps,
      durationMs: finishedAt - startedAt,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[Orchestrator/run-log]:', e);
  }

  return { duplicate, analysis, routing, prediction, steps, docId, finishedAt };
};
