import { useMemo } from 'react';
import { useIssues } from './useIssues';

// Client-side, real-time notification feed derived from the user's own reported
// issues (no backend / Cloud Functions). Surfaces events that happened TO the user:
// authority status changes, resolutions, community milestones, escalations, and
// social posts. Each item: { key, issueId, kind, title, note, time (ISO) }.
const toIso = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return ts.toISOString();
  return null;
};

export function useNotifications(uid) {
  const { issues } = useIssues({ userId: uid, limitCount: 50 });

  const items = useMemo(() => {
    if (!uid) return [];
    const out = [];

    for (const issue of issues) {
      const type = issue.issueType || 'Issue';

      // Status changes made by someone other than the reporter (authority actions).
      (issue.statusHistory || []).forEach((h, idx) => {
        if (!h?.changedAt) return;
        if (h.changedBy === uid || h.changedBy === 'seed') return;
        if (h.status === 'Reported') return; // skip the initial report
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

      // Derived events (not in statusHistory) — one per issue, timed by updatedAt.
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
      // Collaboration: contributors joined / resolution awaiting community verification.
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

    return out
      .filter(i => i.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 50);
  }, [issues, uid]);

  return { items };
}
