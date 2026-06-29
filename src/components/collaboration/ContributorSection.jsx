import { useState } from 'react';
import { Users, UserPlus, LogOut, X, Lock, Unlock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ToastProvider';
import { AUTHORITY_THRESHOLD, CIVIC_SCORE_POINTS } from '../../constants/issueTypes';
import { joinIssue, leaveIssue, removeContributor, setCollaborationOpen, isContributor, isRemoved } from '../../utils/collaboration';
import { bumpOrgCivic } from '../../utils/organizations';
import RoleSelectModal from './RoleSelectModal';

const agoIso = (iso) => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function Ava({ photoURL, name, size = 32 }) {
  if (photoURL) return <img src={photoURL} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, backgroundColor: '#112035',
      border: '0.5px solid #1a2f4a', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${size * 0.4}px`, fontWeight: '700', color: '#7ee8fa' }}>
      {(name || 'C').trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

// Contributors of an issue + Join/Leave + (lead) moderation. `events` (timeline) is used to
// show per-contributor evidence/update counts without an extra read.
export default function ContributorSection({ issue, events = [] }) {
  const { user, userProfile } = useAuth();
  const toast = useToast();
  const [showRole, setShowRole] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!issue?.id) return null;
  const uid = user?.uid;
  const contributors = issue.contributors || [];
  const joined = isContributor(issue, uid);
  const owner = uid && issue.userId === uid;
  const removed = isRemoved(issue, uid);
  const isLead = owner || (uid && (userProfile?.civicScore || 0) >= AUTHORITY_THRESHOLD);
  const open = issue.collaborationOpen !== false;

  // Per-contributor contribution counts from the live timeline.
  const countFor = (cuid) => {
    let ev = 0, up = 0;
    for (const e of events) {
      if (e.userId !== cuid) continue;
      if (e.action === 'evidence_uploaded') ev++;
      else if (e.action === 'update_posted') up++;
    }
    return { ev, up };
  };

  const doJoin = async (role) => {
    setBusy(true);
    const res = await joinIssue(issue.id, user, role);
    if (res?.ok) { bumpOrgCivic(userProfile?.affiliation?.orgId, CIVIC_SCORE_POINTS.JOIN_ISSUE); toast.show(`Joined as ${role} · +5 reputation`, 'success'); setShowRole(false); }
    else if (res?.alreadyJoined) { toast.show("You're already a contributor", 'info'); setShowRole(false); }
    else toast.show(res?.error || 'Could not join', 'error');
    setBusy(false);
  };

  const doLeave = async () => {
    setBusy(true);
    const res = await leaveIssue(issue.id, uid);
    toast.show(res?.ok ? 'You left this collaboration' : (res?.error || 'Could not leave'), res?.ok ? 'info' : 'error');
    setBusy(false);
  };

  const doRemove = async (cuid) => {
    const res = await removeContributor(issue.id, cuid, user);
    toast.show(res?.ok ? 'Contributor removed' : (res?.error || 'Could not remove'), res?.ok ? 'info' : 'error');
  };

  const toggleOpen = async () => {
    const res = await setCollaborationOpen(issue.id, !open);
    toast.show(res?.ok ? (open ? 'Joining closed' : 'Joining reopened') : 'Could not update', res?.ok ? 'info' : 'error');
  };

  return (
    <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={16} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Contributors ({contributors.length})</span>
        </div>
        {/* Join / Leave */}
        {uid && !owner && (
          joined ? (
            <button onClick={doLeave} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'none', border: '0.5px solid #1a2f4a', borderRadius: '8px', padding: '7px 12px',
              color: '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              <LogOut size={13} strokeWidth={1.5} /> Leave
            </button>
          ) : removed ? (
            <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '600' }}>Removed</span>
          ) : !open ? (
            <span style={{ fontSize: '11px', color: '#4a6280', fontWeight: '600' }}>Joining closed</span>
          ) : (
            <button onClick={() => setShowRole(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px',
              backgroundColor: '#00d4ff', color: '#04091a', border: 'none', borderRadius: '8px', padding: '7px 14px',
              fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
              <UserPlus size={14} strokeWidth={2} /> Join Issue
            </button>
          )
        )}
      </div>

      {/* Lead moderation */}
      {isLead && (
        <button onClick={toggleOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '12px',
          background: 'none', border: '0.5px solid #1a2f4a', borderRadius: '8px', padding: '5px 10px',
          color: '#7ee8fa', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
          {open ? <Lock size={12} strokeWidth={1.5} /> : <Unlock size={12} strokeWidth={1.5} />}
          {open ? 'Close joining' : 'Reopen joining'}
        </button>
      )}

      {contributors.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#4a6280' }}>No contributors yet. Join to help solve this issue.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {contributors.map((c) => {
            const { ev, up } = countFor(c.userId);
            return (
              <div key={c.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Ava photoURL={c.photoURL} name={c.displayName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f0f6ff' }}>{c.displayName}</div>
                  <div style={{ fontSize: '11px', color: '#4a6280' }}>
                    {c.role} · joined {agoIso(c.joinedAt)}
                    {ev > 0 ? ` · ${ev} evidence` : ''}{up > 0 ? ` · ${up} updates` : ''}
                  </div>
                </div>
                {isLead && c.userId !== issue.userId && c.userId !== uid && (
                  <button onClick={() => doRemove(c.userId)} title="Remove contributor"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <X size={15} color="#ef4444" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RoleSelectModal open={showRole} onClose={() => setShowRole(false)} onConfirm={doJoin} busy={busy} />
    </div>
  );
}
