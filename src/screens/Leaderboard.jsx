import { useState, useEffect, useMemo } from 'react';
import { getDocs, getCountFromServer, getDoc, doc, collection, query, orderBy, limit, where } from 'firebase/firestore';
import { Crown, Medal, Award, Trophy, Building2, GraduationCap, Users, Copy, FileText, Download, Landmark,
         UserPlus, Flag, X, MapPin } from 'lucide-react';
import { db, auth } from '../firebase';
import TopNav from '../components/TopNav';
import StatsCard from '../components/StatsCard';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ShowMore from '../components/ShowMore';
import Avatar from '../components/Avatar';
import ReputationBadge from '../components/collaboration/ReputationBadge';
import { useToast } from '../components/ToastProvider';
import { usePagination } from '../hooks/usePagination';
import { levelFor } from '../constants/issueTypes';
import { generateCSRReport } from '../utils/csrReport';
import { loadOrganizations } from '../utils/organizations';
import { exportToExcel } from '../utils/exportToExcel';
import { calculateScorecard, aggregateByRole, CIVIC_ROLES } from '../constants/representatives';
import { loadRepresentatives, clearRepresentativesCache } from '../utils/representatives';
import { claimWard, flagRepresentative, getMyClaim } from '../utils/repClaims';
import { useSharedLocation } from '../components/LocationProvider';
import { syncPublicProfile } from '../utils/publicProfile';

// Leaderboard score derived from real adoption activity in the org's zone.
const orgScoreOf = (resolved, total, members) =>
  resolved * 50 + total * 10 + (members || 0) * 5;

// Shared style for the per-tab "Export" buttons (subtle outline).
const exportBtnStyle = {
  width: '100%', padding: '10px', marginTop: '12px',
  backgroundColor: 'transparent', border: '0.5px solid #1a2f4a', borderRadius: '10px',
  color: '#4a6280', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
};

const fieldLabel = { display: 'block', fontSize: '11px', fontWeight: '500', color: '#4a6280',
  textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '6px' };
const fieldInput = { width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
  border: '0.5px solid #1a2f4a', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none' };

const TABS = [
  { key: 'citizens', label: 'Citizens', icon: Users },
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'colleges', label: 'Colleges', icon: GraduationCap },
  { key: 'representatives', label: 'Reps', icon: Landmark },
];

// Rank badge: crown/medal/award for top 3, plain muted number for the rest.
function RankBadge({ rank }) {
  const wrap = {
    width: '32px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  if (rank === 1) return <div style={wrap}><Crown size={20} color="#eab308" strokeWidth={1.5} /></div>;
  if (rank === 2) return <div style={wrap}><Medal size={20} color="#94a3b8" strokeWidth={1.5} /></div>;
  if (rank === 3) return <div style={wrap}><Award size={20} color="#d97706" strokeWidth={1.5} /></div>;
  return (
    <div style={wrap}>
      <span style={{ fontSize: '14px', fontWeight: '600', color: '#4a6280' }}>{rank}</span>
    </div>
  );
}

// 15% opacity background (0x26 ≈ 15%) + 25% border.
function Pill({ label, color }) {
  return (
    <span style={{
      backgroundColor: color + '26', color,
      border: `0.5px solid ${color}40`, borderRadius: '999px',
      fontSize: '10px', fontWeight: '600', padding: '2px 8px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

const cardBase = {
  backgroundColor: '#0d1b2e', borderRadius: '14px',
  border: '0.5px solid #1a2f4a', padding: '12px 14px', marginBottom: '8px',
  display: 'flex', alignItems: 'center', gap: '10px',
};

function CitizenRow({ user, rank, isMe }) {
  return (
    <div style={{
      ...cardBase,
      ...(isMe ? { borderLeft: '3px solid #00d4ff' } : null),
    }}>
      <RankBadge rank={rank} />
      <Avatar src={user.photoURL} name={user.displayName} size={28} ring="1px solid #1a2f4a" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={user.displayName || 'Citizen'} style={{
          fontSize: '15px', fontWeight: '600', color: '#f0f6ff',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {user.displayName || 'Citizen'}{isMe ? ' (You)' : ''}
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          {levelFor(user.civicScore || 0)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>
          <ReputationBadge score={user.civicScore || 0} size={16} />
        </div>
        <div style={{ fontSize: '11px', color: '#4a6280' }}>
          {user.issuesReported || 0} issues
        </div>
      </div>
    </div>
  );
}

function OrgRow({ org, rank, badges, onCSR, csrLoading }) {
  const unitLabel = org.type === 'college' ? 'students' : 'employees';
  return (
    <div style={{
      backgroundColor: '#0d1b2e', borderRadius: '14px',
      border: '0.5px solid #1a2f4a', padding: '12px 14px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <RankBadge rank={rank} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff' }}>{org.name}</span>
            {badges.map(b => <Pill key={b.label} label={b.label} color={b.color} />)}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{org.zoneName}</div>
          <div style={{ fontSize: '11px', color: '#4a6280', marginTop: '2px' }}>
            {org.memberCount || 0} {unitLabel} · {org.totalAdopted || 0} issues in zone
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#00d4ff' }}>{org.score}</div>
          <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
            {org.resolved} resolved
          </div>
        </div>
      </div>
      <button onClick={() => onCSR(org)} disabled={csrLoading === org.id}
        style={{
          marginTop: '8px', padding: '6px 12px',
          backgroundColor: 'transparent', border: '0.5px solid #1a2f4a',
          borderRadius: '8px', color: '#00d4ff', fontSize: '11px',
          fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
        <FileText size={12} strokeWidth={1.5} />
        {csrLoading === org.id ? 'Generating...' : 'CSR Report'}
      </button>
    </div>
  );
}

// companies: #1 Civic Champion (gold), #2-3 Active Adopter (teal). colleges: #1 Civic Campus (green).
const badgesFor = (type, rank) => {
  if (type === 'companies') {
    if (rank === 1) return [{ label: 'Civic Champion', color: '#eab308' }];
    if (rank <= 3) return [{ label: 'Active Adopter', color: '#14b8a6' }];
  }
  if (type === 'colleges') {
    if (rank === 1) return [{ label: 'Civic Campus', color: '#16a34a' }];
  }
  return [];
};

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('citizens');
  const [citizens, setCitizens] = useState([]);
  const [totalCitizens, setTotalCitizens] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [orgs, setOrgs] = useState([]);
  const [allIssues, setAllIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [csrReport, setCsrReport] = useState(null);
  const [csrLoading, setCsrLoading] = useState(false);
  const [myRank, setMyRank] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const toast = useToast();

  const myUid = auth.currentUser?.uid || null;
  const { location: myLocation } = useSharedLocation();

  // Representative self-enrollment ("claim your ward") state.
  const [repView, setRepView] = useState('individual'); // 'individual' | 'party'
  const [showClaim, setShowClaim] = useState(false);
  const [claimName, setClaimName] = useState('');
  const [claimRole, setClaimRole] = useState(CIVIC_ROLES[0]);
  const [claimParty, setClaimParty] = useState(''); // optional, muted political affiliation
  const [claiming, setClaiming] = useState(false);
  const [myClaim, setMyClaim] = useState(null);
  const [flaggedIds, setFlaggedIds] = useState(() => new Set());
  // Bumped after reps load/claim so the (issues-derived) scorecard recomputes against
  // the freshly-merged ward list.
  const [repRefresh, setRepRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Read the PUBLIC mirror (publicProfiles) — users docs are owner-private.
        // Ordered by score, bounded for read safety; top 20 shown.
        const snap = await getDocs(
          query(collection(db, 'publicProfiles'), orderBy('civicScore', 'desc'), limit(500))
        );
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (active) setCitizens(all.slice(0, 20));
      } catch (err) {
        console.error('[Leaderboard] citizens:', err);
        if (active) setError('Could not load the leaderboard. Try again later.');
      } finally {
        if (active) setLoading(false);
      }

      // Accurate citizen total (independent of the 500-row display cap).
      try {
        const c = await getCountFromServer(collection(db, 'publicProfiles'));
        if (active) setTotalCitizens(c.data().count);
      } catch (err) {
        console.error('[Leaderboard] citizen count:', err);
      }

      // Resolved-issue count — aggregation query avoids pulling inline base64 photos.
      try {
        const countSnap = await getCountFromServer(
          query(collection(db, 'issues'), where('status', '==', 'Resolved'))
        );
        if (active) setResolvedCount(countSnap.data().count);
      } catch (err) {
        console.error('[Leaderboard] resolved count:', err);
      }

      // Organizations — tally stats from ONE issues fetch (cache-served on revisit)
      // instead of 2 aggregation counts per org (~300 uncached queries for 150 orgs).
      try {
        const orgList = await loadOrganizations();
        const issuesSnap = await getDocs(
          query(collection(db, 'issues'), orderBy('createdAt', 'desc'), limit(2000))
        );
        // Reuse this single fetch for the representative scorecard too (no extra read).
        if (active) setAllIssues(issuesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const tally = {}; // orgId → { total, resolved, types:{type:count} }
        issuesSnap.docs.forEach((d) => {
          const it = d.data();
          const oid = it.adoptedBy?.id;
          if (!oid) return;
          const t = (tally[oid] ||= { total: 0, resolved: 0, types: {} });
          t.total++;
          if (it.status === 'Resolved') t.resolved++;
          if (it.issueType) t.types[it.issueType] = (t.types[it.issueType] || 0) + 1;
        });
        const withStats = orgList.map((org) => {
          const t = tally[org.id] || { total: 0, resolved: 0, types: {} };
          const topTypes = Object.entries(t.types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
          return { ...org, totalAdopted: t.total, resolved: t.resolved, topTypes,
                   score: orgScoreOf(t.resolved, t.total, org.memberCount) };
        });
        if (active) setOrgs(withStats);
      } catch (err) {
        console.error('[Leaderboard] orgs:', err);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  // Current user's own score + EXACT rank — computed independently so it's correct
  // even when the user is outside the loaded top list (rank = #profiles scoring higher + 1).
  useEffect(() => {
    if (!myUid) return;
    let active = true;
    (async () => {
      try {
        // The owner-readable users/{uid} is authoritative; the public mirror can lag or
        // miss the field, so prefer the real profile and self-heal the mirror from it.
        const [meUserSnap, mePublicSnap] = await Promise.all([
          getDoc(doc(db, 'users', myUid)),
          getDoc(doc(db, 'publicProfiles', myUid)),
        ]);
        const userData = meUserSnap.exists() ? meUserSnap.data() : null;
        const publicScore = mePublicSnap.exists() ? (mePublicSnap.data().civicScore || 0) : 0;
        const score = userData ? (userData.civicScore || 0) : publicScore;

        if (userData && publicScore !== score) {
          syncPublicProfile(myUid, {
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            civicScore: score,
            issuesReported: userData.issuesReported || 0,
          });
        }

        const higher = await getCountFromServer(
          query(collection(db, 'publicProfiles'), where('civicScore', '>', score))
        );
        if (active) { setMyScore(score); setMyRank(higher.data().count + 1); }
      } catch (err) {
        console.error('[Leaderboard] my rank:', err);
      }
    })();
    return () => { active = false; };
  }, [myUid]);

  // Merge any community-claimed / seeded reps into the ward lookups before the scorecard
  // computes, then recompute. (loadRepresentatives is cached, so this is cheap.)
  useEffect(() => {
    let active = true;
    loadRepresentatives().then(() => { if (active) setRepRefresh((n) => n + 1); });
    return () => { active = false; };
  }, []);

  // The ward (if any) the current user already represents.
  useEffect(() => {
    if (!myUid) { setMyClaim(null); return; }
    getMyClaim(myUid).then((c) => setMyClaim(c));
  }, [myUid, repRefresh]);

  const openClaim = () => {
    setClaimName((myClaim?.representative?.name) || auth.currentUser?.displayName || '');
    setClaimRole((myClaim?.representative?.role) || CIVIC_ROLES[0]);
    setClaimParty((myClaim?.representative?.party) || '');
    setShowClaim(true);
  };

  const handleClaim = async () => {
    if (!myUid) { toast.error('Sign in to represent your ward'); return; }
    if (!claimName.trim()) { toast.error('Add your name'); return; }
    if (!myLocation?.lat) { toast.error('Location needed to detect your ward'); return; }
    setClaiming(true);
    const res = await claimWard({
      uid: myUid, name: claimName.trim(), roleCode: claimRole, party: claimParty,
      lat: myLocation.lat, lng: myLocation.lng, city: myLocation.city,
    });
    if (res.ok) {
      clearRepresentativesCache();
      await loadRepresentatives();
      setRepRefresh((n) => n + 1);
      setShowClaim(false);
      toast.success(`You now represent Ward ${res.ward.wardNo} — ${res.ward.wardName}`);
    } else {
      toast.error(res.error || 'Could not save your claim');
    }
    setClaiming(false);
  };

  const handleFlag = async (docId) => {
    if (!myUid) { toast.error('Sign in to flag'); return; }
    if (!docId || flaggedIds.has(docId)) return;
    const res = await flagRepresentative(docId, myUid);
    if (res.ok) {
      setFlaggedIds((s) => new Set(s).add(docId));
      toast.success('Flagged for community review');
    } else {
      toast.error(res.error || 'Could not flag');
    }
  };

  const citizensPage = usePagination(citizens, 10);

  // Time-windowed "most active" board. publicProfiles only holds the cumulative score, so
  // week/month rankings are derived from issues reported in the window (allIssues carries
  // userId/userName/userPhoto/createdAt). 'all' = the cumulative civicScore board.
  const [citizenWindow, setCitizenWindow] = useState('all');
  const windowedCitizens = useMemo(() => {
    if (citizenWindow === 'all') return [];
    const cutoff = Date.now() - (citizenWindow === 'week' ? 7 : 30) * 86400000;
    const tally = {};
    for (const it of allIssues) {
      const t = it.createdAt?.toDate ? it.createdAt.toDate().getTime()
        : (it.createdAt ? new Date(it.createdAt).getTime() : 0);
      if (!t || t < cutoff || !it.userId) continue;
      const e = tally[it.userId] || (tally[it.userId] = { id: it.userId, displayName: it.userName || 'Citizen', photoURL: it.userPhoto || null, count: 0 });
      e.count += 1;
    }
    return Object.values(tally).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [citizenWindow, allIssues]);

  const companies = orgs.filter(o => o.type === 'company').sort((a, b) => b.score - a.score);
  const colleges = orgs.filter(o => o.type === 'college').sort((a, b) => b.score - a.score);
  const companiesPage = usePagination(companies, 10);
  const collegesPage = usePagination(colleges, 10);

  // Representative scorecard — ranked by resolution rate (factual). Neutral: party is
  // metadata only. Derived from the issues fetched above for org stats.
  const repScorecard = useMemo(() => calculateScorecard(allIssues), [allIssues, repRefresh]);
  const repAvgRate = repScorecard.length > 0
    ? Math.round(repScorecard.reduce((s, r) => s + r.resolutionRate, 0) / repScorecard.length)
    : 0;
  // Neutral civic-role rollup for the "By Role" view.
  const roleAgg = useMemo(() => aggregateByRole(repScorecard), [repScorecard]);

  const handleCSR = async (org) => {
    setCsrLoading(org.id);
    try {
      // Top issue types already tallied for this org on load (no extra query).
      const topTypes = org.topTypes || [];
      const report = await generateCSRReport(org.name, org.type || 'company', {
        totalIssues: org.totalAdopted || 0,
        resolved: org.resolved || 0,
        members: org.memberCount || 0,
        zone: org.zoneName || '',
        topTypes: topTypes.length ? topTypes : ['No adopted issues yet'],
      });
      setCsrReport({ org: org.name, ...report });
    } catch (err) {
      console.error('[CSR]:', err);
    }
    setCsrLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
      <TopNav title="Wall of Fame" showBack />

      <div style={{ padding: '16px' }}>
        {/* Summary stats */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <StatsCard label="Citizens" value={totalCitizens} color="#00d4ff" icon={Users} />
          <StatsCard label="Resolved" value={resolvedCount} color="#16a34a" icon={Trophy} />
          <StatsCard label="Organizations" value={orgs.length} color="#00d4ff" icon={Building2} />
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '16px' }}>
          {TABS.map((t, idx) => {
            const isActive = activeTab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                flex: 1, padding: '10px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600',
                backgroundColor: isActive ? '#00d4ff' : 'transparent',
                color: isActive ? '#04091a' : '#94a3b8',
                border: isActive ? 'none' : '0.5px solid #1a2f4a',
                borderTopLeftRadius: idx === 0 ? '10px' : 0,
                borderBottomLeftRadius: idx === 0 ? '10px' : 0,
                borderTopRightRadius: idx === TABS.length - 1 ? '10px' : 0,
                borderBottomRightRadius: idx === TABS.length - 1 ? '10px' : 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Icon size={14} strokeWidth={1.5} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ── CITIZENS ── */}
        {activeTab === 'citizens' && (
          loading ? (
            <LoadingSkeleton count={6} />
          ) : error ? (
            <EmptyState title="Something went wrong" message={error} icon={Trophy} />
          ) : citizens.length === 0 ? (
            <EmptyState title="No citizens yet" message="Be the first to report!" icon={Trophy} />
          ) : (
            <>
              {/* Time-window filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', marginBottom: '12px', paddingBottom: '4px' }}>
                {[{ k: 'all', l: 'All Time' }, { k: 'month', l: 'This Month' }, { k: 'week', l: 'This Week' }].map(({ k, l }) => (
                  <button key={k} onClick={() => setCitizenWindow(k)} style={{
                    padding: '7px 14px', borderRadius: '999px', fontSize: '12px', lineHeight: 1, fontWeight: '600',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, boxSizing: 'border-box',
                    backgroundColor: citizenWindow === k ? '#00d4ff' : 'transparent',
                    color: citizenWindow === k ? '#04091a' : '#94a3b8',
                    border: citizenWindow === k ? '0.5px solid transparent' : '0.5px solid #1a2f4a',
                  }}>{l}</button>
                ))}
              </div>

              {citizenWindow !== 'all' ? (
                windowedCitizens.length === 0 ? (
                  <EmptyState title="No activity in this period" message="No issues were reported in this window yet." icon={Trophy} />
                ) : (
                  <>
                    <div style={{ fontSize: '11px', color: '#4a6280', marginBottom: '10px' }}>
                      Most active citizens — by issues reported {citizenWindow === 'week' ? 'this week' : 'this month'}.
                    </div>
                    {windowedCitizens.map((u, i) => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                        backgroundColor: '#0d1b2e', borderRadius: '12px', border: '0.5px solid #1a2f4a',
                        padding: '12px 14px', marginBottom: '8px' }}>
                        <RankBadge rank={i + 1} />
                        {u.photoURL
                          ? <img src={u.photoURL} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#112035', border: '0.5px solid #1a2f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#7ee8fa', flexShrink: 0 }}>{(u.displayName || 'C').slice(0, 1).toUpperCase()}</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                            {u.displayName}{u.id === myUid ? ' (You)' : ''}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {u.count} report{u.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )
              ) : (
              <>
              {/* Your Rank summary — needs a signed-in user to compute. */}
              {!myUid ? (
                <div style={{
                  backgroundColor: '#0d1b2e', borderRadius: '14px',
                  border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f0f6ff', marginBottom: '4px' }}>
                    Sign in to see your rank
                  </div>
                  <div style={{ fontSize: '12px', color: '#4a6280' }}>
                    {totalCitizens} citizen{totalCitizens !== 1 ? 's' : ''} on the leaderboard
                  </div>
                </div>
              ) : (
              <div style={{
                backgroundColor: '#0d1b2e', borderRadius: '14px',
                border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{
                    fontSize: '11px', fontWeight: '500', color: '#4a6280',
                    letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '4px',
                  }}>Your Rank</div>
                  <div style={{ fontSize: '44px', fontWeight: '800', color: '#00d4ff', lineHeight: 1 }}>
                    {myRank ? `#${myRank}` : '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    out of {totalCitizens} citizen{totalCitizens !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: '500', color: '#4a6280',
                    letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '4px',
                  }}>Community Reputation</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>{myScore}</div>
                </div>
              </div>
              )}

              {citizensPage.visible.map((u, i) => (
                <CitizenRow key={u.id} user={u} rank={i + 1} isMe={u.id === myUid} />
              ))}
              {citizensPage.hasMore && (
                <ShowMore onClick={citizensPage.showMore} remaining={citizensPage.remaining} />
              )}
              <button onClick={async () => {
                const ok = await exportToExcel(citizens, 'users', 'JanaShakti_Citizen_Leaderboard');
                toast[ok ? 'success' : 'error'](ok ? 'Leaderboard exported (anonymized)' : 'Nothing to export');
              }} style={exportBtnStyle}>
                <Download size={14} strokeWidth={1.5} /> Export Citizens
              </button>
              </>
              )}
            </>
          )
        )}

        {/* ── COMPANIES ── */}
        {activeTab === 'companies' && (
          companies.length === 0
            ? <p style={{ fontSize: '13px', color: '#4a6280', textAlign: 'center', padding: '24px' }}>No organizations yet.</p>
            : (
              <>
                {companiesPage.visible.map((org, i) => (
                  <OrgRow key={org.id} org={org} rank={i + 1}
                          badges={badgesFor('companies', i + 1)}
                          onCSR={handleCSR} csrLoading={csrLoading} />
                ))}
                {companiesPage.hasMore && (
                  <ShowMore onClick={companiesPage.showMore} remaining={companiesPage.remaining} />
                )}
                <button onClick={async () => {
                  const ok = await exportToExcel(companies, 'organizations', 'JanaShakti_Companies');
                  toast[ok ? 'success' : 'error'](ok ? 'Companies exported' : 'Nothing to export');
                }} style={exportBtnStyle}>
                  <Download size={14} strokeWidth={1.5} /> Export Companies
                </button>
              </>
            )
        )}

        {/* ── COLLEGES ── */}
        {activeTab === 'colleges' && (
          colleges.length === 0
            ? <p style={{ fontSize: '13px', color: '#4a6280', textAlign: 'center', padding: '24px' }}>No organizations yet.</p>
            : (
              <>
                {collegesPage.visible.map((org, i) => (
                  <OrgRow key={org.id} org={org} rank={i + 1}
                          badges={badgesFor('colleges', i + 1)}
                          onCSR={handleCSR} csrLoading={csrLoading} />
                ))}
                {collegesPage.hasMore && (
                  <ShowMore onClick={collegesPage.showMore} remaining={collegesPage.remaining} />
                )}
                <button onClick={async () => {
                  const ok = await exportToExcel(colleges, 'organizations', 'JanaShakti_Colleges');
                  toast[ok ? 'success' : 'error'](ok ? 'Colleges exported' : 'Nothing to export');
                }} style={exportBtnStyle}>
                  <Download size={14} strokeWidth={1.5} /> Export Colleges
                </button>
              </>
            )
        )}

        {/* ── REPRESENTATIVES (accountability scorecard) ── */}
        {activeTab === 'representatives' && (
          <>
            {/* Self-enrollment — claim your ward (the college/corporate-style process for
                reps). Self-declared & community-tracked; party shown only as a neutral aggregate. */}
            {myClaim ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px',
                            backgroundColor: '#16a34a14', border: '0.5px solid #16a34a33',
                            borderRadius: '12px', padding: '12px 14px', marginBottom: '10px' }}>
                <Landmark size={18} color="#16a34a" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f0f6ff' }}>
                    You represent Ward {myClaim.wardNo} — {myClaim.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {myClaim.representative?.role || 'Civic role'} · self-declared · resolve issues in your ward to lift your rating
                  </div>
                </div>
                <button onClick={openClaim} style={{ background: 'none', border: '0.5px solid #16a34a55',
                          borderRadius: '8px', color: '#86efac', fontSize: '11px', fontWeight: '600',
                          padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
              </div>
            ) : (
              <button onClick={openClaim} style={{ width: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '8px', backgroundColor: '#00d4ff', color: '#04091a',
                        border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px',
                        fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}>
                <UserPlus size={16} strokeWidth={2} /> Represent your ward
              </button>
            )}

            {/* By-Representative | By-Role view toggle (civic role, never party) */}
            <div style={{ display: 'flex', gap: '6px', backgroundColor: '#0d1b2e',
                          border: '0.5px solid #1a2f4a', borderRadius: '10px', padding: '4px' }}>
              {[{ k: 'individual', l: 'By Representative' }, { k: 'role', l: 'By Role' }].map(({ k, l }) => (
                <button key={k} onClick={() => setRepView(k)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '600',
                  backgroundColor: repView === k ? '#112035' : 'transparent',
                  color: repView === k ? '#00d4ff' : '#4a6280' }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#4a6280', margin: '8px 0 14px', lineHeight: 1.4 }}>
              Community-tracked, self-declared — not an official record. Resolution rate is the only ranking metric.
            </div>

            {loading ? (
              <LoadingSkeleton count={6} />
            ) : repView === 'role' ? (
              roleAgg.length === 0 ? (
                <EmptyState title="No role data yet"
                  message="Ward representatives must enrol and resolve issues first" icon={Landmark} />
              ) : (
                <>
                  {roleAgg.map((p, i) => {
                    const rateColor = p.resolutionRate >= 70 ? '#16a34a'
                      : p.resolutionRate >= 40 ? '#f97316' : '#ef4444';
                    return (
                      <div key={p.role} style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                                border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '8px',
                                borderLeft: `3px solid ${rateColor}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%',
                                    backgroundColor: rateColor + '20', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '13px', fontWeight: '700',
                                    color: rateColor, flexShrink: 0 }}>{i + 1}</div>
                            <div>
                              <p style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>{p.role}</p>
                              <p style={{ fontSize: '11px', color: '#4a6280' }}>
                                {p.reps} rep{p.reps > 1 ? 's' : ''} · {p.totalIssues} issues tracked
                              </p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '20px', fontWeight: '700', color: rateColor }}>{p.resolutionRate}%</div>
                            <div style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase' }}>resolved</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )
            ) : repScorecard.length === 0 ? (
              <EmptyState
                title="No representatives yet"
                message="Be the first — tap “Represent your ward” above"
                icon={Landmark}
              />
            ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <StatsCard label="Tracked" value={repScorecard.length} color="#8b5cf6" icon={Landmark} />
                <StatsCard label="Avg Rate" value={`${repAvgRate}%`} color="#16a34a" icon={Trophy} />
              </div>

              {repScorecard.map((rep, i) => {
                const rateColor = rep.resolutionRate >= 70 ? '#16a34a'
                  : rep.resolutionRate >= 40 ? '#f97316' : '#ef4444';
                return (
                  <div key={`${rep.wardNo}-${i}`} style={{
                    backgroundColor: '#0d1b2e', borderRadius: '14px',
                    border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '8px',
                    borderLeft: `3px solid ${rateColor}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          backgroundColor: rateColor + '20', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '700', color: rateColor,
                        }}>{i + 1}</div>
                        <div>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                            {rep.representative.name}
                          </p>
                          <p style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Ward {rep.wardNo} — {rep.wardName}, {rep.city}
                          </p>
                          <p style={{ fontSize: '11px', color: '#4a6280' }}>
                            {rep.representative.role || 'Civic role'} · Since {rep.representative.since}{rep.representative.party ? ` · ${rep.representative.party}` : ''}
                          </p>
                          {rep.selfDeclared && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                                           fontSize: '10px', fontWeight: '600', color: '#7ee8fa',
                                           backgroundColor: '#00d4ff14', border: '0.5px solid #00d4ff33',
                                           borderRadius: '999px', padding: '2px 8px' }}>
                              Self-declared{rep.flagCount > 0 ? ` · ${rep.flagCount} flag${rep.flagCount > 1 ? 's' : ''}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: rateColor }}>
                          {rep.resolutionRate}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase' }}>
                          resolved
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '10px', paddingTop: '10px',
                                  borderTop: '0.5px solid #1a2f4a' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>{rep.totalIssues}</span>
                        <span style={{ fontSize: '10px', color: '#4a6280', marginLeft: '4px' }}>total</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a' }}>{rep.resolved}</span>
                        <span style={{ fontSize: '10px', color: '#4a6280', marginLeft: '4px' }}>resolved</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>~{rep.avgDays}d</span>
                        <span style={{ fontSize: '10px', color: '#4a6280', marginLeft: '4px' }}>avg</span>
                      </div>
                      {rep.wallOfShame > 0 && (
                        <div>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444' }}>{rep.wallOfShame}</span>
                          <span style={{ fontSize: '10px', color: '#ef4444', marginLeft: '4px' }}>ignored</span>
                        </div>
                      )}
                    </div>
                    {rep.resolutionRate >= 70 && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        backgroundColor: '#16a34a15', borderRadius: '999px',
                        padding: '3px 10px', marginTop: '8px',
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: '600', color: '#16a34a' }}>
                          Responsive Representative
                        </span>
                      </div>
                    )}
                    {rep.resolutionRate < 30 && rep.totalIssues >= 3 && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        backgroundColor: '#ef444415', borderRadius: '999px',
                        padding: '3px 10px', marginTop: '8px',
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: '600', color: '#ef4444' }}>
                          Low accountability — Wall of Shame
                        </span>
                      </div>
                    )}
                    {rep.selfDeclared && rep.docId && (
                      <div style={{ marginTop: '8px' }}>
                        <button onClick={() => handleFlag(rep.docId)} disabled={flaggedIds.has(rep.docId)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px',
                                   background: 'none', border: '0.5px solid #1a2f4a', borderRadius: '999px',
                                   padding: '4px 10px', fontSize: '10px', fontWeight: '600',
                                   color: flaggedIds.has(rep.docId) ? '#4a6280' : '#94a3b8',
                                   cursor: flaggedIds.has(rep.docId) ? 'default' : 'pointer' }}>
                          <Flag size={11} strokeWidth={1.5} /> {flaggedIds.has(rep.docId) ? 'Flagged' : 'Flag claim'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={async () => {
                const rows = repScorecard.map((r) => ({
                  representative: r.representative.name, role: r.representative.role, party: r.representative.party || '',
                  ward: `${r.wardNo} — ${r.wardName}`, city: r.city,
                  totalIssues: r.totalIssues, resolved: r.resolved,
                  resolutionRate: `${r.resolutionRate}%`, avgDays: r.avgDays,
                  ignored: r.wallOfShame,
                }));
                const ok = await exportToExcel(rows, 'generic', 'JanaShakti_Representatives');
                toast[ok ? 'success' : 'error'](ok ? 'Scorecard exported' : 'Nothing to export');
              }} style={exportBtnStyle}>
                <Download size={14} strokeWidth={1.5} /> Export Scorecard
              </button>
            </>
            )}
            {showClaim && (
              <div onClick={() => !claiming && setShowClaim(false)} style={{ position: 'fixed', inset: 0,
                        zIndex: 1000, backgroundColor: 'rgba(4,9,26,0.8)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                          border: '0.5px solid #00d4ff40', padding: '18px', width: '100%', maxWidth: '400px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#f0f6ff' }}>Represent your ward</span>
                    <button onClick={() => !claiming && setShowClaim(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <X size={18} color="#4a6280" />
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px', lineHeight: 1.5 }}>
                    Stand as the representative for the ward you're in. One claim per ward. Self-declared and
                    community-tracked — not an official record.
                  </p>

                  <label style={fieldLabel}>Your name</label>
                  <input value={claimName} onChange={(e) => setClaimName(e.target.value)}
                         placeholder="As it should appear" style={fieldInput} />

                  <label style={{ ...fieldLabel, marginTop: '12px' }}>Your civic role</label>
                  <select value={claimRole} onChange={(e) => setClaimRole(e.target.value)} style={fieldInput}>
                    {CIVIC_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>

                  <label style={{ ...fieldLabel, marginTop: '12px' }}>Party / affiliation <span style={{ textTransform: 'none', letterSpacing: 0, color: '#4a6280' }}>(optional)</span></label>
                  <input value={claimParty} onChange={(e) => setClaimParty(e.target.value)}
                         placeholder="Leave blank if non-partisan" style={fieldInput} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px',
                                fontSize: '11px', color: '#4a6280' }}>
                    <MapPin size={13} strokeWidth={1.5} />
                    {myLocation?.lat ? 'Ward detected from your current location' : 'Waiting for your location…'}
                  </div>

                  <button onClick={handleClaim} disabled={claiming || !myLocation?.lat}
                    style={{ width: '100%', marginTop: '16px',
                             backgroundColor: (claiming || !myLocation?.lat) ? '#1a2f4a' : '#00d4ff',
                             color: '#04091a', border: 'none', borderRadius: '10px', padding: '13px',
                             fontSize: '14px', fontWeight: '700',
                             cursor: (claiming || !myLocation?.lat) ? 'default' : 'pointer' }}>
                    {claiming ? 'Saving…' : myClaim ? 'Update my claim' : 'Claim this ward'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* CSR report — modal overlay so it's always visible regardless of scroll */}
        {csrReport && (
          <div onClick={() => setCsrReport(null)} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            backgroundColor: 'rgba(4, 9, 26, 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: '#0d1b2e', borderRadius: '14px',
            border: '0.5px solid #00d4ff40', padding: '16px',
            width: '100%', maxWidth: '440px', maxHeight: '85vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                {csrReport.title}
              </span>
              <button onClick={() => setCsrReport(null)} style={{
                background: 'none', border: 'none', color: '#4a6280', cursor: 'pointer', fontSize: '16px',
              }}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '12px' }}>
              {csrReport.summary}
            </p>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#00d4ff' }}>{csrReport.impactScore}</div>
                <div style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase' }}>Impact</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#16a34a' }}>{csrReport.resolutionRate}</div>
                <div style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase' }}>Resolution</div>
              </div>
            </div>
            {csrReport.highlights && (
              <div style={{ marginBottom: '12px' }}>
                {csrReport.highlights.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#16a34a', fontSize: '12px' }}>•</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>{h}</span>
                  </div>
                ))}
              </div>
            )}
            {csrReport.linkedinPost && (
              <div style={{ backgroundColor: '#112035', borderRadius: '10px', padding: '10px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase', fontWeight: '500' }}>
                    LinkedIn ready
                  </span>
                  <button onClick={() => {
                    navigator.clipboard.writeText(csrReport.linkedinPost);
                    toast.info('LinkedIn report copied!');
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Copy size={12} color="#00d4ff" strokeWidth={1.5} />
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#7ee8fa', lineHeight: 1.5 }}>{csrReport.linkedinPost}</p>
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
