import { useState } from 'react';
import { ShieldCheck, Check, Minus, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ToastProvider';
import { distanceKm } from '../../utils/geo';
import { submitVerificationVote, checkVerificationThreshold } from '../../utils/collaboration';

const VOTE_RADIUS_KM = 2;       // loophole #6: voters must be near the issue
const MIN_JOIN_HOURS = 24;      // loophole #1: contributors wait 24h before voting

const here = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000 },
  );
});

// Shown only when status === 'Needs Verification'. Yes / Partial / No, gated by live
// geolocation (within 2 km) and a 24h-since-join rule for contributors.
export default function CommunityVerification({ issue }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (issue?.status !== 'Needs Verification') return null;

  const cv = issue.communityVerification || { votes: { yes: 0, no: 0, partial: 0 }, threshold: 5, positiveRatio: 0.7 };
  const v = cv.votes || { yes: 0, no: 0, partial: 0 };
  const total = (v.yes || 0) + (v.no || 0) + (v.partial || 0);
  const threshold = cv.threshold || 5;
  const positivePct = total ? Math.round((((v.yes || 0) + (v.partial || 0) * 0.5) / total) * 100) : 0;
  const alreadyVoted = (cv.voters || []).includes(user?.uid);

  const vote = async (choice) => {
    if (!user?.uid) { toast.show('Sign in to verify', 'error'); return; }
    if (alreadyVoted) return;
    // 24h-since-join gate (only for contributors)
    const me = (issue.contributors || []).find((c) => c.userId === user.uid);
    if (me?.joinedAt) {
      const hrs = (Date.now() - new Date(me.joinedAt).getTime()) / 3600000;
      if (hrs < MIN_JOIN_HOURS) { toast.show('Contributors can verify 24h after joining', 'error'); return; }
    }
    setBusy(true);
    // 2 km live-location gate
    const pos = await here();
    if (!pos) { toast.show('Location needed to verify (enable GPS)', 'error'); setBusy(false); return; }
    if (issue.location && distanceKm(pos, issue.location) > VOTE_RADIUS_KM) {
      toast.show(`You must be within ${VOTE_RADIUS_KM} km of the issue to verify`, 'error'); setBusy(false); return;
    }
    const res = await submitVerificationVote(issue.id, user, choice);
    if (res?.ok) {
      const outcome = res.outcome;
      toast.show(outcome === 'passed' ? '✅ Verified — issue resolved!' : outcome === 'failed' ? 'Reopened — not enough confirmation' : 'Vote recorded · +5 reputation', outcome === 'failed' ? 'info' : 'success');
    } else if (res?.alreadyVoted) {
      toast.show('You already verified this', 'info');
    } else {
      toast.show(res?.error || 'Could not record vote', 'error');
    }
    setBusy(false);
  };

  const Btn = ({ choice, label, Icon, color }) => (
    <button onClick={() => vote(choice)} disabled={busy || alreadyVoted} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      padding: '10px 6px', borderRadius: '10px', cursor: (busy || alreadyVoted) ? 'default' : 'pointer',
      backgroundColor: color + '14', border: `0.5px solid ${color}40`, color,
      fontSize: '12px', fontWeight: '700', opacity: alreadyVoted ? 0.5 : 1 }}>
      <Icon size={16} strokeWidth={2} /> {label}
    </button>
  );

  return (
    <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #a855f733',
      borderLeft: '3px solid #a855f7', padding: '16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <ShieldCheck size={16} color="#a855f7" strokeWidth={1.5} />
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#f0f6ff' }}>Community verification needed</span>
      </div>
      <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>Has this issue actually been resolved? Verify from near the location.</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <Btn choice="yes" label="Yes, fixed" Icon={Check} color="#16a34a" />
        <Btn choice="partial" label="Partially" Icon={Minus} color="#f97316" />
        <Btn choice="no" label="No" Icon={X} color="#ef4444" />
      </div>

      <div style={{ height: '6px', backgroundColor: '#112035', borderRadius: '999px', overflow: 'hidden', marginBottom: '6px' }}>
        <div style={{ height: '100%', width: `${Math.min(100, (total / threshold) * 100)}%`, backgroundColor: '#a855f7' }} />
      </div>
      <div style={{ fontSize: '11px', color: '#4a6280' }}>
        {total} of {threshold} votes · {positivePct}% positive
        {alreadyVoted ? ' · you verified' : ''}
      </div>
    </div>
  );
}
