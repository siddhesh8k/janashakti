import { FilePlus, UserPlus, Paperclip, MessageSquare, CheckCircle,
         ThumbsUp, CheckCircle2, RotateCcw, Activity } from 'lucide-react';

const ICON = {
  issue_created: FilePlus,
  contributor_joined: UserPlus,
  evidence_uploaded: Paperclip,
  update_posted: MessageSquare,
  resolution_requested: CheckCircle,
  verification_vote: ThumbsUp,
  issue_resolved: CheckCircle2,
  issue_reopened: RotateCcw,
};
const VERB = {
  issue_created: 'created this issue',
  contributor_joined: 'joined',
  evidence_uploaded: 'uploaded evidence',
  update_posted: 'posted an update',
  resolution_requested: 'marked as resolved',
  verification_vote: 'verified',
  issue_resolved: 'issue resolved',
  issue_reopened: 'issue reopened',
};

const ago = (ts) => {
  if (!ts?.toDate) return '';
  const s = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const initials = (n) => (n || 'C').trim().slice(0, 1).toUpperCase();

// GitHub-style immutable activity timeline (read-only). Renders oldest-first.
export default function ActivityTimeline({ events = [], loading }) {
  return (
    <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Activity size={16} color="#00d4ff" strokeWidth={1.5} />
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Activity</span>
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: '#4a6280' }}>Loading activity…</p>
      ) : events.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#4a6280' }}>No activity yet — be the first to contribute.</p>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* vertical connector */}
          <div style={{ position: 'absolute', left: '13px', top: '4px', bottom: '4px', width: '1px', backgroundColor: '#1a2f4a' }} />
          {events.map((e) => {
            const Icon = ICON[e.action] || Activity;
            const resolved = e.action === 'issue_resolved';
            const reopened = e.action === 'issue_reopened';
            const dot = resolved ? '#16a34a' : reopened ? '#ef4444' : e.action === 'resolution_requested' ? '#a855f7' : '#00d4ff';
            return (
              <div key={e.id} style={{ display: 'flex', gap: '12px', position: 'relative', marginBottom: '14px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, zIndex: 1,
                  backgroundColor: dot + '20', border: `1px solid ${dot}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={14} color={dot} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
                  <div style={{ fontSize: '13px', color: '#f0f6ff' }}>
                    <span style={{ fontWeight: '600' }}>{e.displayName || 'Citizen'}</span>{' '}
                    <span style={{ color: '#94a3b8' }}>{VERB[e.action] || e.action}</span>
                    <span style={{ fontSize: '11px', color: '#4a6280', marginLeft: '6px' }}>· {ago(e.createdAt)}</span>
                  </div>
                  {e.message && VERB[e.action] !== e.message && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px', lineHeight: 1.4 }}>{e.message}</div>
                  )}
                  {e.action === 'resolution_requested' && (
                    <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '10px', fontWeight: '600',
                      color: '#a855f7', backgroundColor: '#a855f714', border: '0.5px solid #a855f733',
                      borderRadius: '999px', padding: '2px 8px' }}>Needs community verification</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { initials };
