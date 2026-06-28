import { useState, useEffect } from 'react';
import { getDocs, getDoc, collection, query, where, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Newspaper, FileText, Lock, Unlock, Clock, CheckCircle, XCircle,
         MapPin, Copy, Shield, AlertTriangle, Download } from 'lucide-react';
import { auth, db } from '../firebase';
import TopNav from '../components/TopNav';
import SeverityBadge from '../components/SeverityBadge';
import StatsCard from '../components/StatsCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import ShowMore from '../components/ShowMore';
import { useToast } from '../components/ToastProvider';
import { generatePressRelease } from '../utils/pressRelease';
import { exportToExcel } from '../utils/exportToExcel';
import { daysOpenOf, isStoryReady, claimStatus } from '../utils/story';
import { usePagination } from '../hooks/usePagination';

const FILTERS = ['All Stories', 'Critical', '30+ Days', 'High Pressure'];

// Evidence pill — boolean criteria use green/gray check/cross; magnitude criteria
// (days, escalation) pass an explicit color + icon and ignore the met flag.
function EvidencePill({ met, label, color, icon: Icon }) {
  const fg = color || (met ? '#16a34a' : '#4a6280');
  const bg = color ? color + '1a' : (met ? '#16a34a1a' : '#1a2f4a');
  const PillIcon = Icon || (met ? CheckCircle : XCircle);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '6px',
      fontSize: '10px', fontWeight: '600', backgroundColor: bg, color: fg,
    }}>
      <PillIcon size={10} strokeWidth={2} /> {label}
    </span>
  );
}

function PressRelease({ release, onCopy }) {
  const fullText =
    `${release.headline}\n\n${release.dateline} ${release.body}\n\n` +
    `"${release.citizenQuote}"\n\n— A concerned citizen via JanaShakti platform`;
  const liText =
    `${release.headline}\n\n${release.subheadline}\n\n` +
    `${(release.dataPoints || []).map(d => `• ${d}`).join('\n')}\n\n` +
    `#JanaShakti #CivicAccountability #India`;

  return (
    <div style={{
      backgroundColor: '#0d1b2e', border: '0.5px solid #00d4ff40',
      borderRadius: '14px', padding: '16px', marginTop: '10px',
    }}>
      <div style={{ fontSize: '16px', fontWeight: '700', color: '#f0f6ff', lineHeight: 1.3 }}>
        {release.headline}
      </div>
      {release.subheadline && (
        <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>
          {release.subheadline}
        </div>
      )}
      {release.dateline && (
        <div style={{
          fontSize: '11px', color: '#4a6280', textTransform: 'uppercase',
          letterSpacing: '0.5px', marginTop: '8px', marginBottom: '8px',
        }}>
          {release.dateline}
        </div>
      )}

      <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {release.body}
      </p>

      {release.citizenQuote && (
        <div style={{ borderLeft: '3px solid #00d4ff', paddingLeft: '12px', margin: '12px 0' }}>
          <p style={{ fontSize: '13px', color: '#7ee8fa', fontStyle: 'italic', lineHeight: 1.5 }}>
            “{release.citizenQuote}”
          </p>
        </div>
      )}

      {Array.isArray(release.dataPoints) && release.dataPoints.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {release.dataPoints.map((d, i) => (
            <span key={i} style={{
              backgroundColor: '#112035', borderRadius: '6px',
              padding: '4px 10px', fontSize: '11px', color: '#f0f6ff',
            }}>{d}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button onClick={() => onCopy(fullText, 'Press release copied!')} style={{
          flex: 1, padding: '10px', backgroundColor: 'transparent',
          color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}>
          <Copy size={14} strokeWidth={1.5} /> Copy Full Text
        </button>
        <button onClick={() => onCopy(liText, 'LinkedIn version copied!')} style={{
          flex: 1, padding: '10px', backgroundColor: 'transparent',
          color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}>
          <Copy size={14} strokeWidth={1.5} /> Copy for LinkedIn
        </button>
      </div>

      {release.editorNote && (
        <p style={{
          fontSize: '11px', color: '#4a6280', fontStyle: 'italic',
          borderTop: '0.5px solid #1a2f4a', paddingTop: '8px',
        }}>
          {release.editorNote}
        </p>
      )}
    </div>
  );
}

function StoryCard({ issue, myUid, release, generating, onGenerate, onClaim, onCopy }) {
  const days = daysOpenOf(issue);
  const claim = claimStatus(issue, myUid);
  const daysColor = days >= 30 ? '#ef4444' : days >= 14 ? '#f97316' : '#4a6280';
  const level = issue.escalationLevel || 0;
  const escColor = ['#4a6280', '#eab308', '#f97316', '#ef4444'][Math.min(level, 3)];

  return (
    <div style={{
      backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
      borderRadius: '14px', padding: '14px', marginBottom: '10px',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff' }}>{issue.issueType}</span>
        <SeverityBadge severity={issue.severity} />
      </div>

      {/* Description */}
      {issue.description && (
        <p title={issue.description} style={{
          fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '10px',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {issue.description}
        </p>
      )}

      {/* Evidence strength */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        <EvidencePill met={!!issue.photoUrl} label="Photo evidence" />
        <EvidencePill met={(issue.confirmations || 0) >= 5} label={`${issue.confirmations || 0} confirmations`} />
        <EvidencePill met={issue.routedTo?.emailSent === true} label="Authority notified" />
        <EvidencePill color={daysColor} icon={Clock} label={`${days} days open`} />
        <EvidencePill color={escColor} icon={Shield} label={`Escalation L${level}`} />
      </div>

      {/* Location + Complaint ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
        <MapPin size={12} color="#4a6280" strokeWidth={1.5} />
        <span style={{ fontSize: '11px', color: '#4a6280' }}>
          {issue.locationText?.split(',').slice(0, 2).join(',') || 'Unknown location'}
        </span>
      </div>
      {issue.complaintId && (
        <div style={{ marginBottom: '10px' }}>
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px', fontWeight: '600', color: '#00d4ff',
            backgroundColor: '#00d4ff15', border: '0.5px solid #00d4ff40',
            borderRadius: '6px', padding: '3px 8px', letterSpacing: '0.5px',
          }}>{issue.complaintId}</span>
        </div>
      )}

      {/* Claim status line */}
      {claim.state === 'locked' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
          <Lock size={12} color="#ef4444" strokeWidth={1.5} />
          <span style={{ fontSize: '11px', color: '#4a6280' }}>
            Claimed — available in {claim.hoursRemaining}h
          </span>
        </div>
      )}
      {claim.state === 'mine' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
          <Unlock size={12} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: '600' }}>
            Your exclusive — {claim.hoursRemaining}h remaining
          </span>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => onGenerate(issue)} disabled={generating} style={{
          flex: 1, padding: '10px', backgroundColor: '#00d4ff',
          color: '#04091a', border: 'none', borderRadius: '10px',
          fontSize: '12px', fontWeight: '600', cursor: generating ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}>
          <FileText size={14} strokeWidth={1.5} />
          {generating ? 'Generating...' : 'Generate Press Release'}
        </button>
        <button onClick={() => onClaim(issue)}
          disabled={claim.state === 'locked' || claim.state === 'mine'}
          style={{
            flex: 1, padding: '10px', backgroundColor: 'transparent',
            color: claim.state === 'locked' ? '#ef4444' : '#00d4ff',
            border: `0.5px solid ${claim.state === 'locked' ? '#ef444440' : '#00d4ff40'}`,
            borderRadius: '10px', fontSize: '12px', fontWeight: '600',
            cursor: (claim.state === 'locked' || claim.state === 'mine') ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          }}>
          {claim.state === 'locked'
            ? <><Lock size={14} strokeWidth={1.5} /> Locked {claim.hoursRemaining}h</>
            : claim.state === 'mine'
              ? <><Unlock size={14} strokeWidth={1.5} /> Your Exclusive</>
              : <><Unlock size={14} strokeWidth={1.5} /> Claim Story — 48h Exclusive</>}
        </button>
      </div>

      {/* Press release */}
      {release && <PressRelease release={release} onCopy={onCopy} />}
    </div>
  );
}

export default function JournalistDashboard() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All Stories');
  const [pressReleases, setPressReleases] = useState({});
  const [prLoading, setPrLoading] = useState(null);
  const toastApi = useToast();
  const setToast = (t) => { if (t) toastApi.show(t.msg, t.type); };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        // Oldest unresolved first — the most newsworthy stories are the longest
        // ignored. Excludes Resolved at the query level and widens the window so
        // story-ready issues aren't hidden behind the 20 oldest. (Index: A2.)
        const snap = await getDocs(
          query(collection(db, 'issues'),
            where('status', 'in', ['Reported', 'Verified', 'In Progress']),
            orderBy('createdAt', 'asc'), limit(100))
        );
        if (active) setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('[Journalist]:', err);
        if (active) setToast({ msg: 'Failed to load stories', type: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const handleGenerate = async (issue) => {
    setPrLoading(issue.id);
    try {
      const release = await generatePressRelease(issue);
      setPressReleases(prev => ({ ...prev, [issue.id]: release }));
    } catch (err) {
      console.error('[PR]:', err);
      setToast({ msg: 'Press release generation failed', type: 'error' });
    } finally {
      setPrLoading(null);
    }
  };

  const handleClaim = async (issue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setToast({ msg: 'Sign in to claim a story', type: 'error' }); return; }
    try {
      await updateDoc(doc(db, 'issues', issue.id), {
        storyClaimedBy: uid,
        storyClaimedAt: serverTimestamp(),
      });
      // Optimistic local update (getDocs is one-shot, no live listener).
      setIssues(prev => prev.map(i =>
        i.id === issue.id
          ? { ...i, storyClaimedBy: uid, storyClaimedAt: { toDate: () => new Date() } }
          : i
      ));
      setToast({ msg: 'Story claimed — 48h exclusive!', type: 'success' });
    } catch (err) {
      console.error('[Claim]:', err);
      // The claim-guard rule rejects when the story is already claimed and the 48h
      // window hasn't expired. Refresh this issue so the UI shows the real holder.
      try {
        const fresh = await getDoc(doc(db, 'issues', issue.id));
        if (fresh.exists()) {
          const data = { id: fresh.id, ...fresh.data() };
          setIssues(prev => prev.map(i => (i.id === issue.id ? data : i)));
        }
      } catch (refreshErr) {
        console.error('[Claim refresh]:', refreshErr);
      }
      setToast({ msg: 'Already claimed by another journalist', type: 'error' });
    }
  };

  const handleCopy = (text, msg) => {
    try {
      navigator.clipboard.writeText(text);
      setToast({ msg, type: 'info' });
    } catch (err) {
      console.error('[Copy]:', err);
      setToast({ msg: 'Copy failed', type: 'error' });
    }
  };

  const myUid = auth.currentUser?.uid || null;
  const storyReady = issues.filter(i => isStoryReady(i));
  const wallOfShameCount = issues.filter(i => i.status !== 'Resolved' && daysOpenOf(i) >= 30).length;
  const unclaimedCount = storyReady.filter(i => claimStatus(i, myUid).state === 'open').length;

  const visible = storyReady.filter(i => {
    if (filter === 'Critical') return i.severity === 'Critical';
    if (filter === '30+ Days') return daysOpenOf(i) >= 30;
    if (filter === 'High Pressure') return (i.pressureScore || 0) >= 50;
    return true;
  });

  const { visible: shownStories, hasMore, remaining, showMore } = usePagination(visible, 8);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
      <TopNav title="Journalist Dashboard" showBack />

      <div style={{ padding: '16px' }}>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
          Story-ready issues with full evidence packages
        </p>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <StatsCard label="Story Ready" value={storyReady.length} color="#ec4899" icon={Newspaper} />
          <StatsCard label="30+ Days Old" value={wallOfShameCount} color="#ef4444" icon={AlertTriangle} />
          <StatsCard label="Unclaimed" value={unclaimedCount} color="#16a34a" icon={Unlock} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '12px', paddingBottom: '4px' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: '999px', fontSize: '11px',
              fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              backgroundColor: filter === f ? '#00d4ff' : 'transparent',
              color: filter === f ? '#04091a' : '#94a3b8',
              border: filter === f ? 'none' : '0.5px solid #1a2f4a',
            }}>{f}</button>
          ))}
        </div>

        {/* Privacy-safe story package export (sources anonymized) */}
        {storyReady.length > 0 && (
          <button onClick={async () => {
            const ok = await exportToExcel(storyReady, 'stories', 'JanaShakti_Story_Package');
            setToast({ msg: ok ? 'Story package exported (sources anonymized)' : 'Nothing to export', type: ok ? 'success' : 'error' });
          }} style={{
            width: '100%', padding: '10px', backgroundColor: '#0d1b2e',
            border: '0.5px solid #ec489940', borderRadius: '10px',
            color: '#ec4899', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            marginBottom: '12px',
          }}>
            <Download size={14} strokeWidth={1.5} /> Export Story Package
          </button>
        )}

        {/* Content */}
        {loading ? (
          <LoadingSkeleton count={4} />
        ) : storyReady.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="No stories ready yet"
            message="Issues need 14+ days and 5+ confirmations to become story-ready."
          />
        ) : visible.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#4a6280', textAlign: 'center', padding: '24px' }}>
            No story-ready issues match this filter.
          </p>
        ) : (
          <>
            {shownStories.map(issue => (
              <StoryCard
                key={issue.id}
                issue={issue}
                myUid={myUid}
                release={pressReleases[issue.id]}
                generating={prLoading === issue.id}
                onGenerate={handleGenerate}
                onClaim={handleClaim}
                onCopy={handleCopy}
              />
            ))}
            {hasMore && <ShowMore onClick={showMore} remaining={remaining} />}
          </>
        )}
      </div>

    </div>
  );
}
