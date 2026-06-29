import { useState, useRef, useEffect } from 'react';
import { doc, updateDoc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { AlertTriangle, Clock, CheckCircle, Camera, ThumbsUp, Timer, ShieldCheck, Download } from 'lucide-react';
import { db, auth } from '../firebase';
import { compressImage } from '../utils/gemini';
import { useIssues } from '../hooks/useIssues';
import { usePagination } from '../hooks/usePagination';
import { isAuthority, enrollAuthority } from '../utils/authority';
import { verifyResolution } from '../agents/resolutionVerifier';
import { scoreESGImpact } from '../agents/esgScorer';
import TopNav from '../components/TopNav';
import SeverityBadge from '../components/SeverityBadge';
import StatsCard from '../components/StatsCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ShowMore from '../components/ShowMore';
import { useToast } from '../components/ToastProvider';
import { isValidImageFile, MESSAGES } from '../utils/validation';
import { DEPARTMENT_MAP } from '../constants/departments';
import { exportToExcel } from '../utils/exportToExcel';

// Which department owns an issue (derived from its type, same mapping the agents/
// import use). Falls back to the routed name, then the general dept.
const deptOf = (i) =>
  DEPARTMENT_MAP[i.issueType]?.name || i.routedTo?.departmentName || DEPARTMENT_MAP.Other.name;
// Unique department names for the filter dropdown.
const DEPARTMENTS = [...new Set(Object.values(DEPARTMENT_MAP).map(d => d.name))].sort();

export default function AuthorityDashboard() {
  const { issues, loading } = useIssues({ limitCount: 50 });
  const [filter, setFilter] = useState('All');
  const [dept, setDept] = useState('All');
  const toastApi = useToast();
  const setToast = (t) => { if (t) toastApi.show(t.msg, t.type); };
  const [resolving, setResolving] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const fileRef = useRef(null);

  // Status/resolution writes require the signed-in user to be in the /authorities
  // allowlist (firestore.rules). Check once so we can gate the action buttons and
  // never surface a silent permission-denied.
  useEffect(() => {
    let active = true;
    isAuthority(auth.currentUser?.uid).then((ok) => { if (active) setAuthorized(ok); });
    return () => { active = false; };
  }, []);

  const handleEnroll = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setToast({ msg: 'Please sign in first', type: 'error' }); return; }
    setEnrolling(true);
    const ok = await enrollAuthority(uid);
    setEnrolling(false);
    if (ok) { setAuthorized(true); setToast({ msg: 'Authority mode enabled', type: 'success' }); }
    else setToast({ msg: 'Could not enable authority mode', type: 'error' });
  };

  // Scope the whole dashboard (stats + list) to the selected department.
  const scoped = dept === 'All' ? issues : issues.filter(i => deptOf(i) === dept);
  const openIssues = scoped.filter(i => i.status !== 'Resolved');
  const overdueIssues = openIssues.filter(i => {
    if (!i.createdAt) return false;
    const date = i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
    return Math.floor((Date.now() - date.getTime()) / 86400000) > 7;
  });
  const resolvedIssues = scoped.filter(i => i.status === 'Resolved');
  const criticalIssues = openIssues.filter(i => i.severity === 'Critical');

  const filtered = filter === 'All' ? openIssues
    : filter === 'Overdue' ? overdueIssues
    : filter === 'Critical' ? criticalIssues
    : openIssues;

  const { visible, hasMore, remaining, showMore } = usePagination(filtered, 8);

  const handleStatusUpdate = async (issueId, newStatus, note) => {
    try {
      const uid = auth.currentUser?.uid || 'authority';
      // arrayUnion APPENDS to the inspection log instead of overwriting it.
      await updateDoc(doc(db, 'issues', issueId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: newStatus,
          changedAt: new Date().toISOString(),
          changedBy: uid,
          note: note || `Status updated to ${newStatus}`,
        }),
      });
      setToast({ msg: `Status: ${newStatus}`, type: 'success' });
      setNoteFor(null);
      setNoteText('');
    } catch (err) {
      console.error('[StatusUpdate]:', err);
      setToast({ msg: 'Update failed', type: 'error' });
    }
  };

  const handleResolvePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file || !resolving) return;
    if (!isValidImageFile(file)) {
      setToast({ msg: MESSAGES.badImage, type: 'error' });
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        // Inline compressed base64 (no Cloud Storage — free-plan friendly).
        const compact = await compressImage(dataUrl.split(',')[1], 720, 0.5);
        const inlineUrl = `data:image/jpeg;base64,${compact}`;
        const photoUrl = inlineUrl.length < 900000 ? inlineUrl : '';

        // Agent 5 — AI verifies the fix photo is genuine (flags, never blocks).
        const theIssue = issues.find((i) => i.id === resolving);
        const verdict = await verifyResolution(compact, theIssue, resolving);
        const verified = verdict.is_genuine && verdict.is_resolved;

        await setDoc(doc(db, 'issues', resolving), {
          status: 'Resolved',
          resolutionPhotoUrl: photoUrl,
          resolutionVerified: verified,
          resolutionGenuine: verdict.is_genuine,
          resolutionConfidence: verdict.confidence,
          resolutionNote: verdict.reasoning,
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          statusHistory: arrayUnion({
            status: 'Resolved',
            changedAt: new Date().toISOString(),
            changedBy: auth.currentUser?.uid || 'authority',
            note: verified ? 'Resolved — AI-verified photo' : 'Resolved — photo flagged for review',
          }),
        }, { merge: true });
        // Org stats are computed live from issues on the leaderboard (see
        // utils/orgStats.js), so there's no counter to bump here.
        const resolvedId = resolving;
        setResolving(null);
        setToast({
          msg: verified
            ? '✅ Resolved! ESG impact being calculated...'
            : '⚠️ Resolved (photo flagged for review) — calculating ESG impact...',
          type: verified ? 'success' : 'info',
        });

        // Agent 6 — score the civic ESG impact of the now-resolved issue. The resolvedAt
        // shim gives scoreESGImpact a "now" timestamp so it can compute days-to-resolve.
        const resolvedIssue = {
          ...(theIssue || {}), id: resolvedId, status: 'Resolved',
          resolvedAt: { toDate: () => new Date() },
        };
        const esg = await scoreESGImpact(resolvedIssue, resolvedId);
        if (esg && esg.overall_esg != null) {
          setTimeout(() => setToast({
            msg: `\u{1F33F} ESG Score: ${esg.overall_esg}/10 — Impact verified`,
            type: 'success',
          }), 3000);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[Resolve]:', err);
      setToast({ msg: 'Resolution failed', type: 'error' });
    }
  };

  const getDaysOpen = (ts) => {
    if (!ts) return 0;
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return Math.floor((Date.now() - date.getTime()) / 86400000);
  };

  // SLA countdown from routedTo.slaHours minus hours elapsed since createdAt.
  const getSla = (issue) => {
    const slaHours = issue.routedTo?.slaHours;
    if (!slaHours || !issue.createdAt) return null;
    const date = issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt);
    const elapsed = (Date.now() - date.getTime()) / 3600000;
    const remaining = Math.round(slaHours - elapsed);
    return { remaining, overdue: remaining < 0 };
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="Authority Dashboard" showBack />
      <div style={{ padding: '16px' }}><LoadingSkeleton count={4} /></div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="Authority Dashboard" showBack />
      <div style={{ padding: '16px' }}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <StatsCard label="Pending" value={openIssues.length} color="#f97316" />
          <StatsCard label="Overdue" value={overdueIssues.length} color="#ef4444" />
          <StatsCard label="Resolved" value={resolvedIssues.length} color="#16a34a" />
          <StatsCard label="Total" value={scoped.length} color="#00d4ff" />
        </div>

        {/* Privacy-safe Excel export (respects the department filter) */}
        <button onClick={async () => {
          const ok = await exportToExcel(scoped, 'issues', 'JanaShakti_Authority_Report');
          setToast({ msg: ok ? 'Exported to Excel (anonymized)' : 'Nothing to export', type: ok ? 'success' : 'error' });
        }} style={{
          width: '100%', padding: '10px', backgroundColor: '#0d1b2e',
          border: '0.5px solid #1a2f4a', borderRadius: '10px',
          color: '#00d4ff', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          marginBottom: '12px',
        }}>
          <Download size={14} strokeWidth={1.5} /> Export to Excel (Privacy Safe)
        </button>

        {/* Authority gate — status/resolution writes require allowlist membership */}
        {!authorized && (
          <div style={{
            backgroundColor: '#00d4ff14', border: '0.5px solid #00d4ff40',
            borderRadius: '12px', padding: '14px', marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <ShieldCheck size={18} color="#00d4ff" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                Authority mode required
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '10px' }}>
              Updating issue status or marking issues resolved is restricted to authorities.
              Enable authority mode for this account to manage issues.
            </p>
            <button onClick={handleEnroll} disabled={enrolling} style={{
              backgroundColor: '#00d4ff', color: '#04091a', border: 'none',
              borderRadius: '10px', padding: '10px 16px', fontSize: '13px',
              fontWeight: '600', cursor: enrolling ? 'wait' : 'pointer',
            }}>
              {enrolling ? 'Enabling…' : 'Enable Authority Mode'}
            </button>
          </div>
        )}

        {/* Filters */}
        {/* Department filter — show only one department's issues (and stats) */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                        textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '6px' }}>
            Department
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{
            width: '100%', padding: '10px 12px', backgroundColor: '#112035',
            color: '#f0f6ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '13px', outline: 'none', cursor: 'pointer',
          }}>
            <option value="All">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
          {['All', 'Overdue', 'Critical'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: '999px', fontSize: '11px',
              fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
              backgroundColor: filter === f ? '#00d4ff' : 'transparent',
              color: filter === f ? '#04091a' : '#94a3b8',
              border: filter === f ? 'none' : '0.5px solid #1a2f4a',
            }}>{f}</button>
          ))}
        </div>

        {/* Overdue alert */}
        {overdueIssues.length > 0 && filter !== 'Overdue' && (
          <div style={{
            backgroundColor: '#ef44441a', borderRadius: '10px',
            padding: '10px 14px', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <AlertTriangle size={16} color="#ef4444" strokeWidth={1.5} />
            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
              {overdueIssues.length} issues overdue (7+ days)
            </span>
          </div>
        )}

        {/* Issues list */}
        {filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: '#4a6280', textAlign: 'center', padding: '32px 16px' }}>
            No {filter !== 'All' ? `${filter.toLowerCase()} ` : ''}issues
            {dept !== 'All' ? ` for ${dept}` : ''}.
          </p>
        )}
        {visible.map(issue => {
          const days = getDaysOpen(issue.createdAt);
          const sla = getSla(issue);
          return (
            <div key={issue.id} style={{
              backgroundColor: '#0d1b2e', borderRadius: '14px',
              border: '0.5px solid #1a2f4a', padding: '14px',
              marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                  {issue.issueType}
                </span>
                <SeverityBadge severity={issue.severity} />
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', lineHeight: 1.5 }}>
                {issue.locationText?.split(',').slice(0, 2).join(',') || 'Unknown'}
              </p>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: days > 7 ? '#ef4444' : '#4a6280',
                               display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Clock size={11} strokeWidth={1.5} /> {days}d open
                </span>
                <span style={{ fontSize: '11px', color: '#4a6280' }}>
                  {issue.confirmations || 0} confirmed
                </span>
                {issue.prediction && (
                  <span style={{ fontSize: '11px', color: '#00d4ff' }}>
                    Priority: {issue.prediction.priority_score}/100
                  </span>
                )}
                {sla && (
                  <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px',
                                 color: sla.overdue ? '#ef4444' : '#86efac' }}>
                    <Timer size={11} strokeWidth={1.5} />
                    {sla.overdue ? `SLA overdue ${Math.abs(sla.remaining)}h` : `${sla.remaining}h remaining`}
                  </span>
                )}
              </div>

              {/* Inspection note input (shown when marking In Progress) */}
              {noteFor === issue.id && (
                <div style={{ marginBottom: '10px' }}>
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Inspection note (what you observed on site)…" rows={2}
                    style={{
                      width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
                      border: '0.5px solid #1a2f4a', borderRadius: '8px',
                      padding: '8px 10px', fontSize: '12px', outline: 'none',
                      resize: 'vertical', boxSizing: 'border-box', marginBottom: '6px',
                    }} />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleStatusUpdate(issue.id, 'In Progress', noteText)} style={{
                      flex: 1, padding: '8px', backgroundColor: '#f97316',
                      color: '#04091a', border: 'none', borderRadius: '8px',
                      fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                    }}>Save & mark In Progress</button>
                    <button onClick={() => { setNoteFor(null); setNoteText(''); }} style={{
                      padding: '8px 12px', backgroundColor: 'transparent',
                      color: '#94a3b8', border: '0.5px solid #1a2f4a', borderRadius: '8px',
                      fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {authorized && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {issue.status === 'Reported' && (
                    <button onClick={() => handleStatusUpdate(issue.id, 'Verified')} style={{
                      flex: 1, padding: '8px', backgroundColor: '#3b82f61a',
                      color: '#3b82f6', border: '0.5px solid #3b82f640',
                      borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    }}>
                      <ThumbsUp size={12} strokeWidth={1.5} /> Verify
                    </button>
                  )}
                  <button onClick={() => { setNoteFor(issue.id); setNoteText(''); }} style={{
                    flex: 1, padding: '8px', backgroundColor: '#f973161a',
                    color: '#f97316', border: '0.5px solid #f9731640',
                    borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                  }}>In Progress</button>
                  <button onClick={() => {
                    setResolving(issue.id);
                    fileRef.current?.click();
                  }} style={{
                    flex: 1, padding: '8px', backgroundColor: '#16a34a1a',
                    color: '#16a34a', border: '0.5px solid #16a34a40',
                    borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  }}>
                    <Camera size={12} strokeWidth={1.5} /> Resolved
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {hasMore && <ShowMore onClick={showMore} remaining={remaining} />}

        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          onChange={handleResolvePhoto} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
