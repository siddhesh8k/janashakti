// Pure notification derivation — no Firestore, no React — so it's unit-testable.
// `useNotifications` fetches the data (issues the user reported + issues they joined +
// recent timeline activity) and calls buildNotifications(). Each item:
//   { key, issueId, kind, title, note, time (ISO) }
// kinds: status | resolved | milestone | escalation | social | reward | vote | activity | removed

export const toIso = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return ts.toISOString();
  return null;
};

const ACTIVITY_ACTIONS = ['evidence_uploaded', 'update_posted'];
const ACTIVITY_PER_ISSUE = 2; // cap per issue so one busy thread can't flood the feed

// Reporter-side notifications: events that happened TO an issue the user created.
// (Unchanged behaviour — extracted verbatim from the original useNotifications.)
function ownerNotifications(issues, uid, out) {
  for (const issue of issues) {
    if (!issue) continue;
    const type = issue.issueType || 'Issue';

    (issue.statusHistory || []).forEach((h, idx) => {
      if (!h?.changedAt) return;
      if (h.changedBy === uid || h.changedBy === 'seed') return;
      if (h.status === 'Reported') return;
      out.push({
        key: `${issue.id}-sh-${idx}`,
        issueId: issue.id,
        kind: h.status === 'Resolved' ? 'resolved' : 'status',
        title: h.status === 'Resolved'
          ? `Your ${type} report was resolved`
          : `Your ${type} report was marked ${h.status}`,
        note: h.note || '',
        time: h.changedAt,
      });
    });

    const updated = toIso(issue.updatedAt);
    if ((issue.confirmations || 0) >= 5) {
      out.push({
        key: `${issue.id}-conf`, issueId: issue.id, kind: 'milestone',
        title: `Your ${type} reached ${issue.confirmations} confirmations`,
        note: 'The community is backing this issue.', time: updated,
      });
    }
    if ((issue.escalationLevel || 0) > 0) {
      out.push({
        key: `${issue.id}-esc`, issueId: issue.id, kind: 'escalation',
        title: `Your ${type} was escalated (level ${issue.escalationLevel})`,
        note: 'Raised to a higher authority.', time: updated,
      });
    }
    if (issue.xPosted) {
      out.push({
        key: `${issue.id}-social`, issueId: issue.id, kind: 'social',
        title: `Your ${type} was posted on @JanaShaktiApp`,
        note: 'Amplified on social media.', time: updated,
      });
    }
    if ((issue.contributors || []).length >= 1) {
      const n = issue.contributors.length;
      out.push({
        key: `${issue.id}-collab`, issueId: issue.id, kind: 'milestone',
        title: `${n} citizen${n > 1 ? 's' : ''} joined your ${type} report`,
        note: 'Community contributors are helping solve this.', time: updated,
      });
    }
    if (issue.status === 'Needs Verification') {
      out.push({
        key: `${issue.id}-needsverif`, issueId: issue.id, kind: 'status',
        title: `Your ${type} report needs community verification`,
        note: 'A contributor marked it resolved — nearby citizens are verifying.', time: updated,
      });
    }
  }
}

// Contributor-side notifications: events on issues the user JOINED (in contributedUids),
// not their own. Skips owned issues (the reporter branch covers those).
function contributorNotifications(joinedIssues, uid, out) {
  const removedIssueIds = new Set();

  for (const issue of joinedIssues) {
    if (!issue || issue.userId === uid) continue; // owner branch owns these
    const type = issue.issueType || 'Issue';
    const updated = toIso(issue.updatedAt);

    // Removed from the collaboration → that's the only thing they need to hear about it.
    if ((issue.removedUids || []).includes(uid)) {
      removedIssueIds.add(issue.id);
      out.push({
        key: `c-${issue.id}-removed`, issueId: issue.id, kind: 'removed',
        title: `You were removed from a ${type} report`,
        note: 'The issue owner closed your collaboration access.', time: updated,
      });
      continue;
    }

    const contributed = (issue.contributedUids || []).includes(uid);

    // Resolved → claim the +25 (or acknowledge if already claimed).
    if (issue.status === 'Resolved' && contributed) {
      const claimed = (issue.closeRewardedBy || []).includes(uid);
      out.push({
        key: `c-${issue.id}-resolved`, issueId: issue.id,
        kind: claimed ? 'resolved' : 'reward',
        title: claimed
          ? `A ${type} you joined was resolved`
          : `A ${type} you joined was resolved — open to claim +25 reputation`,
        note: claimed ? 'Thanks for helping close it.' : 'Tap to open and claim your contributor reward.',
        time: toIso(issue.resolvedAt) || updated,
      });
    }

    // Awaiting community verification → the contributor can vote.
    if (issue.status === 'Needs Verification') {
      out.push({
        key: `c-${issue.id}-vote`, issueId: issue.id, kind: 'vote',
        title: `A ${type} you joined needs your verification`,
        note: 'Confirm whether it’s fixed — vote from within 2 km.', time: updated,
      });
    }

    // Status advanced by someone else (In Progress / Verified …) — Resolved + Needs
    // Verification are handled above, Reported is the initial state.
    (issue.statusHistory || []).forEach((h, idx) => {
      if (!h?.changedAt) return;
      if (h.changedBy === uid || h.changedBy === 'seed') return;
      if (['Reported', 'Resolved', 'Needs Verification'].includes(h.status)) return;
      out.push({
        key: `c-${issue.id}-sh-${idx}`, issueId: issue.id, kind: 'status',
        title: `A ${type} you joined is now ${h.status}`,
        note: h.note || '', time: h.changedAt,
      });
    });
  }

  return removedIssueIds;
}

// Activity by OTHER contributors (evidence / updates) on issues the user joined.
function activityNotifications(activityEvents, uid, removedIssueIds, out) {
  const byIssue = {};
  for (const e of (activityEvents || [])) {
    if (!e || e.userId === uid) continue;
    if (!ACTIVITY_ACTIONS.includes(e.action)) continue;
    if (removedIssueIds.has(e.issueId)) continue;
    (byIssue[e.issueId] = byIssue[e.issueId] || []).push(e);
  }
  for (const issueId of Object.keys(byIssue)) {
    const evs = byIssue[issueId]
      .map((e) => ({ ...e, iso: toIso(e.createdAt) }))
      .filter((e) => e.iso)
      .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime())
      .slice(0, ACTIVITY_PER_ISSUE);
    for (const e of evs) {
      const type = e.issueType || 'Issue';
      const who = e.displayName || 'A contributor';
      const what = e.action === 'evidence_uploaded' ? 'added evidence to' : 'posted an update on';
      out.push({
        key: `c-${issueId}-act-${e.id || e.iso}`, issueId, kind: 'activity',
        title: `${who} ${what} a ${type} you joined`,
        note: e.message || '', time: e.iso,
      });
    }
  }
}

export function buildNotifications({ ownedIssues = [], joinedIssues = [], activityEvents = [], uid } = {}) {
  if (!uid) return [];
  const out = [];
  ownerNotifications(ownedIssues, uid, out);
  const removedIssueIds = contributorNotifications(joinedIssues, uid, out);
  activityNotifications(activityEvents, uid, removedIssueIds, out);

  return out
    .filter((i) => i.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 50);
}
