import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { callGeminiText, logAgent } from '../utils/gemini';
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

export const checkDuplicate = async (newIssue, issueId) => {
  const startTime = Date.now();
  try {
    const { lat, lng } = newIssue.location || {};
    if (!lat || !lng) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return { isDuplicate: false, existingIssueId: null };
    }

    const snap = await getDocs(
      query(collection(db, 'issues'),
        where('status', 'in', ['Reported', 'Verified', 'In Progress', 'Needs Verification']),
        where('issueType', '==', newIssue.issueType)
      )
    );

    const nearby = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.location &&
        Math.abs(i.location.lat - lat) < NEARBY_GEO_BOUND &&
        Math.abs(i.location.lng - lng) < NEARBY_GEO_BOUND &&
        i.id !== issueId
      );

    if (nearby.length === 0) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return { isDuplicate: false, existingIssueId: null };
    }

    const prompt = `Are these two civic issue reports describing the same problem?

Report A (new): "${newIssue.description}"
Report B (existing): "${nearby[0].description}"
Both are: ${newIssue.issueType} in the same area.

Return ONLY valid JSON:
{
  "isDuplicate": true,
  "similarity": 85,
  "reasoning": "one sentence explanation"
}`;

    const result = await callGeminiText(prompt);
    const output = {
      isDuplicate: result.isDuplicate && result.similarity > 65,
      existingIssueId: result.isDuplicate ? nearby[0].id : null,
      similarity: result.similarity,
    };

    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output,
      processingTimeMs: Date.now() - startTime, success: true });
    return output;
  } catch (err) {
    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message });
    return { isDuplicate: false, existingIssueId: null };
  }
};
