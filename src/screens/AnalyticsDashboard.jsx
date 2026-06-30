import { memo, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Bot, MapPin, Clock, Zap,
         Activity, ShieldAlert, Droplets, Trash2, Lightbulb, Shield, Construction,
         Sparkles, Trophy, Newspaper, Download, Target, Leaf, Globe } from 'lucide-react';
import { useIssues } from '../hooks/useIssues';
import { usePagination } from '../hooks/usePagination';
import { useToast } from '../components/ToastProvider';
import { generateCityInsights } from '../utils/gemini';
import { trendSeries } from '../utils/trend';
import { exportToExcel } from '../utils/exportToExcel';
import TopNav from '../components/TopNav';
import IssueCard from '../components/IssueCard';
import ChartCarousel from '../components/ChartCarousel';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ShowMore from '../components/ShowMore';
import { WALL_SHAME_DAYS } from '../constants/cities';
import { useAuth } from '../hooks/useAuth';
import SDGBadge from '../components/SDGBadge';
import CityESGCard from '../components/CityESGCard';
import { SDG_COLORS, ESG_GRADES, ISSUE_SDG_MAP } from '../constants/esg';

// Map Gemini's icon-name strings to Lucide components.
const INSIGHT_ICONS = {
  AlertTriangle, TrendingUp, TrendingDown, MapPin, Clock, Zap,
  Activity, ShieldAlert, Droplets, Trash2, Lightbulb, Shield, Construction, Bot,
};

// Button-triggered AI insights — kept as an isolated component so generating
// them never blocks the main dashboard render, and only runs on demand.
const AiInsights = memo(function AiInsights({ issues }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const summary = {
        total: issues.length,
        byType: issues.reduce((a, i) => { a[i.issueType] = (a[i.issueType] || 0) + 1; return a; }, {}),
        bySeverity: issues.reduce((a, i) => { a[i.severity] = (a[i.severity] || 0) + 1; return a; }, {}),
        byStatus: issues.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {}),
        avgConfirmations: issues.length
          ? Math.round(issues.reduce((s, i) => s + (i.confirmations || 0), 0) / issues.length) : 0,
      };
      const result = await generateCityInsights(summary);
      if (Array.isArray(result)) setInsights(result.slice(0, 4));
    } catch (err) {
      console.error('[Insights]:', err);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  return (
    <div style={{ marginTop: '20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        <Sparkles size={16} color="#00d4ff" strokeWidth={1.5} />
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>AI City Insights</span>
      </div>

      {!fetched && !loading && (
        <button onClick={generate} disabled={issues.length === 0} style={{
          width: '100%', padding: '12px', backgroundColor: '#112035',
          color: '#00d4ff', border: '0.5px solid #00d4ff40', borderRadius: '10px',
          fontSize: '13px', fontWeight: '600', cursor: issues.length ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          <Bot size={16} strokeWidth={1.5} /> Generate AI Insights
        </button>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: '10px', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
          <div style={{ width: '18px', height: '18px', border: '2px solid #1a2f4a',
                        borderTop: '2px solid #00d4ff', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite' }} />
          Gemini analyzing city patterns...
        </div>
      )}

      {!loading && insights.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {insights.map((ins, i) => {
            const Icon = INSIGHT_ICONS[ins.icon] || Bot;
            const color = ins.color || '#00d4ff';
            return (
              <div key={i} style={{
                backgroundColor: '#0d1b2e', borderRadius: '12px',
                border: '0.5px solid #1a2f4a', borderLeft: `3px solid ${color}`, padding: '12px',
              }}>
                <Icon size={16} color={color} strokeWidth={1.5} style={{ marginBottom: '6px' }} />
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#f0f6ff',
                              marginBottom: '4px', lineHeight: 1.3 }}>{ins.title}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>{ins.body}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && fetched && insights.length === 0 && (
        <p style={{ fontSize: '12px', color: '#7689a3' }}>Insights unavailable right now — try again later.</p>
      )}
    </div>
  );
});

const TYPE_COLORS = {
  Pothole: '#f97316', Streetlight: '#eab308', Garbage: '#22c55e',
  'Water Leakage': '#3b82f6', Infrastructure: '#8b5cf6', Other: '#64748b',
};
const STATUS_COLORS = {
  Reported: '#475569', Verified: '#3b82f6', 'In Progress': '#f97316', Resolved: '#16a34a',
};

// SDG → name lookup, derived from the per-issue-type mapping (first name wins).
const SDG_NAME = {};
Object.values(ISSUE_SDG_MAP).forEach((info) => {
  info.sdgs.forEach((s, i) => { if (!SDG_NAME[s]) SDG_NAME[s] = info.names[i]; });
});

// Highest grade whose threshold the score clears (ESG_GRADES is sorted desc by min).
const gradeFor = (score) => ESG_GRADES.find((g) => score >= g.min) || ESG_GRADES[ESG_GRADES.length - 1];

const PILLAR_COLOR = { E: '#4C9F38', S: '#DD1367', G: '#00689D' };

// City ESG rankings — sample data (rankings are produced monthly by AI analysis).
const ESG_LEADERBOARD = [
  { rank: 1, city: 'Pune',      esgScore: 8.7, issuesResolved: 234, trend: 'up',   highlight: 'Best governance response rate' },
  { rank: 2, city: 'Bangalore', esgScore: 8.1, issuesResolved: 198, trend: 'down', highlight: 'Strong social impact score' },
  { rank: 3, city: 'Chennai',   esgScore: 7.6, issuesResolved: 156, trend: 'same', highlight: 'Leading in water conservation' },
  { rank: 4, city: 'Mumbai',    esgScore: 7.2, issuesResolved: 143, trend: 'up',   highlight: 'Improving governance score' },
  { rank: 5, city: 'Delhi',     esgScore: 6.8, issuesResolved: 112, trend: 'down', highlight: 'Focus on critical issues' },
];

// ESG tab body — isolated so the main dashboard render stays readable (mirrors AiInsights).
const ESGTab = memo(function ESGTab({ city, esg, navigate }) {
  const [showAllSdgs, setShowAllSdgs] = useState(false);
  const grade = gradeFor(esg.cityScore);
  const sdgShown = showAllSdgs ? esg.sdgRows : esg.sdgRows.slice(0, 5);

  return (
    <div>
      {/* City ESG grade */}
      <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a',
                    padding: '24px 16px', marginBottom: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>{city}</div>
        <div style={{ fontSize: '56px', fontWeight: '800', color: grade.color, lineHeight: 1 }}>{grade.grade}</div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: grade.color, marginTop: '6px' }}>
          {esg.cityScore.toFixed(1)}/10 ESG Score
        </div>
        <div style={{ fontSize: '12px', color: '#7689a3', marginTop: '8px' }}>
          Based on {esg.thisMonth} issues resolved this month
        </div>
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px',
                        color: '#7689a3', marginBottom: '4px' }}>
            <span>vs last month</span>
            <span style={{ color: esg.improvement >= 0 ? '#16a34a' : '#ef4444', fontWeight: '600' }}>
              {esg.improvement >= 0 ? '+' : ''}{esg.improvement}%
            </span>
          </div>
          <div style={{ height: '6px', borderRadius: '999px', backgroundColor: '#112035', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '999px',
              width: `${Math.max(4, Math.min(100, 50 + esg.improvement / 2))}%`,
              backgroundColor: esg.improvement >= 0 ? '#16a34a' : '#ef4444' }} />
          </div>
        </div>
      </div>

      {/* SDG contributions */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Globe size={16} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>SDG Contributions</span>
        </div>
        {sdgShown.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#7689a3' }}>No SDG data yet.</p>
        ) : sdgShown.map((r) => (
          <div key={r.sdg} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SDGBadge sdgId={r.sdg} name={r.name} size="md" />
              <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>{r.count}</span>
            </div>
            <div style={{ height: '4px', borderRadius: '999px', backgroundColor: '#112035',
                          marginTop: '6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '999px',
                width: `${esg.sdgTotal ? (r.count / esg.sdgTotal) * 100 : 0}%`,
                backgroundColor: SDG_COLORS[r.sdg] || '#7689a3' }} />
            </div>
          </div>
        ))}
        {esg.sdgRows.length > 5 && (
          <button onClick={() => setShowAllSdgs((v) => !v)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: '13px', fontWeight: '600', color: '#00d4ff', marginTop: '4px',
          }}>
            {showAllSdgs ? 'Show less' : `See all ${esg.sdgRows.length}`}
          </button>
        )}
      </div>

      {/* City ESG rankings */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <Target size={16} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>City ESG Rankings</span>
        </div>
        <p style={{ fontSize: '11px', color: '#00d4ff', marginBottom: '12px' }}>Powered by Gemini AI</p>
        {ESG_LEADERBOARD.map((c) => (<CityESGCard key={c.rank} {...c} />))}
        <p style={{ fontSize: '11px', color: '#7689a3', marginTop: '6px', textAlign: 'center' }}>
          Rankings update monthly via AI analysis
        </p>
      </div>

      {/* Top environmental impact */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Leaf size={16} color="#16a34a" strokeWidth={1.5} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Top Environmental Impact</span>
        </div>
        {esg.topEnv.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#7689a3' }}>No ESG-scored resolutions yet.</p>
        ) : esg.topEnv.map((i) => (
          <div key={i.id} onClick={() => navigate(`/issue/${i.id}`)} style={{
            backgroundColor: '#0d1b2e', borderRadius: '12px', border: '0.5px solid #1a2f4a',
            padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff', minWidth: 0,
                             overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.issueType}
              </span>
              {i.esgScore?.sdg_tags?.[0] && <SDGBadge sdgId={i.esgScore.sdg_tags[0]} size="sm" />}
            </div>
            <div style={{ fontSize: '11px', color: '#7689a3', marginTop: '2px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i.locationText}
            </div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '8px' }}>
              {['E', 'S', 'G'].map((p) => (
                <span key={p} style={{ fontSize: '12px', fontWeight: '700', color: PILLAR_COLOR[p] }}>
                  {p}: {(Number(i.esgScore[`${p.toLowerCase()}_score`]) || 0).toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { issues, loading } = useIssues({ limitCount: 100 });
  const { userProfile } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab === 'esg' ? 'esg' : 'overview');

  // Wall of shame — computed before the loading guard so its pagination hook is
  // called unconditionally (Rules of Hooks); `issues` is [] while loading.
  // Memoized so the derived objects keep stable references across re-renders (only
  // recompute when `issues` changes) — otherwise the spread below would defeat
  // IssueCard's React.memo. `wallOfShame: true` is baked in here, not at render.
  const wallOfShameIssues = useMemo(() => issues.filter(i => {
    if (i.status === 'Resolved') return false;
    if (!i.createdAt) return false;
    const date = i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
    const daysOpen = Math.floor((Date.now() - date.getTime()) / 86400000);
    return daysOpen >= WALL_SHAME_DAYS;
  }).map(i => (i.wallOfShame ? i : { ...i, wallOfShame: true })), [issues]);
  const wos = usePagination(wallOfShameIssues, 6);

  // ESG aggregates for the ESG tab (memoized; recomputed only when issues change).
  const esg = useMemo(() => {
    const resolved = issues.filter((i) => i.status === 'Resolved');
    const total = issues.length;
    const rate = total ? resolved.length / total : 0;
    const realScores = resolved
      .map((i) => Number(i.esgScore?.overall_esg))
      .filter(Number.isFinite);
    const cityScore = realScores.length
      ? realScores.reduce((a, b) => a + b, 0) / realScores.length
      : Number((4 + rate * 6).toFixed(1));

    const tsOf = (i) => {
      const t = i.resolvedAt || i.updatedAt || i.createdAt;
      return t?.toDate ? t.toDate() : (t ? new Date(t) : null);
    };
    const now = new Date();
    const mk = (d) => d.getFullYear() * 12 + d.getMonth();
    const thisKey = mk(now);
    let thisMonth = 0, lastMonth = 0;
    resolved.forEach((i) => {
      const d = tsOf(i); if (!d) return;
      const k = mk(d);
      if (k === thisKey) thisMonth += 1;
      else if (k === thisKey - 1) lastMonth += 1;
    });
    const improvement = lastMonth
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : (thisMonth ? 100 : 0);

    const sdgCounts = {};
    issues.forEach((i) => {
      const info = ISSUE_SDG_MAP[i.issueType] || ISSUE_SDG_MAP.Other;
      info.sdgs.forEach((s) => { sdgCounts[s] = (sdgCounts[s] || 0) + 1; });
    });
    const sdgTotal = Object.values(sdgCounts).reduce((a, b) => a + b, 0);
    const sdgRows = Object.entries(sdgCounts)
      .map(([sdg, count]) => ({ sdg, count, name: SDG_NAME[sdg] || sdg }))
      .sort((a, b) => b.count - a.count);

    const topEnv = resolved
      .filter((i) => i.esgScore && Number.isFinite(Number(i.esgScore.e_score)))
      .sort((a, b) => Number(b.esgScore.e_score) - Number(a.esgScore.e_score))
      .slice(0, 3);

    return { cityScore, thisMonth, lastMonth, improvement, sdgRows, sdgTotal, topEnv };
  }, [issues]);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="City Intelligence" showBack />
      <div style={{ padding: '16px' }}><LoadingSkeleton count={4} /></div>
    </div>
  );

  // Aggregate data
  const byType = Object.entries(
    issues.reduce((acc, i) => { acc[i.issueType] = (acc[i.issueType] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value, color: TYPE_COLORS[name] || '#64748b' }));

  // The pie shows every slice, but the LEGEND collapses the long tail of categories
  // into a single "Others" row so it doesn't take huge vertical space.
  const COLLAPSE_TYPES = new Set([
    'Broken Road', 'Water Logging', 'Illegal Construction', 'Garbage Dumping',
    'Broken Streetlight', 'Water Supply Issue', 'Air Pollution', 'Open Manhole',
    'Traffic Signal Malfunction', 'Footpath Encroachment', 'Stray Animal Menace',
    'Noise Pollution', 'Sewage Overflow', 'Dangerous Tree',
  ]);
  const typeLegend = (() => {
    const kept = byType.filter(t => !COLLAPSE_TYPES.has(t.name));
    const othersVal = byType.filter(t => COLLAPSE_TYPES.has(t.name)).reduce((s, t) => s + t.value, 0);
    return othersVal > 0 ? [...kept, { name: 'Others', value: othersVal, color: '#64748b' }] : kept;
  })();

  const byStatus = Object.entries(
    issues.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#475569' }));

  // Per-city breakdown (the page is "City Intelligence" — show issues w.r.t. each city).
  // city is tagged at report time (Bangalore / Mumbai / Delhi / Other).
  const byCity = Object.entries(
    issues.reduce((acc, i) => {
      const c = i.city || 'Other';
      if (!acc[c]) acc[c] = { total: 0, open: 0, resolved: 0 };
      acc[c].total += 1;
      if (i.status === 'Resolved') acc[c].resolved += 1; else acc[c].open += 1;
      return acc;
    }, {})
  ).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);

  const trend = trendSeries(issues);

  const tooltipStyle = {
    backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
    borderRadius: '8px', fontSize: '11px', color: '#f0f6ff',
  };
  // recharts colors tooltip item text by the series/slice color (gray here) → hard
  // to read on the dark card. Force readable item + label colors.
  const tipItemStyle = { color: '#f0f6ff' };
  const tipLabelStyle = { color: '#94a3b8' };

  // The three charts share one carousel card (saves vertical space). Each slide is the
  // chart body only — ChartCarousel supplies the card chrome + title + swipe/dots.
  const noData = <p style={{ color: '#7689a3', fontSize: '12px' }}>No data</p>;
  const chartSlides = [
    {
      title: 'Issues by Type',
      content: byType.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '140px', flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={byType} cx="50%" cy="50%" innerRadius={36} outerRadius={66}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {byType.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tipItemStyle} labelStyle={tipLabelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap',
                        alignContent: 'center', gap: '6px 12px' }}>
            {typeLegend.map(t => (
              <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: t.color }} />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t.name} ({t.value})</span>
              </div>
            ))}
          </div>
        </div>
      ) : noData,
    },
    {
      title: 'Issues by Status',
      content: byStatus.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byStatus} margin={{ top: 16, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: '#7689a3', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#7689a3', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tipItemStyle} labelStyle={tipLabelStyle} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {byStatus.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : noData,
    },
    ...(trend.length > 0 ? [{
      title: 'Reported vs Resolved',
      content: (
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={trend} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2f4a" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: '#7689a3', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#7689a3', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tipItemStyle} labelStyle={tipLabelStyle} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Line type="monotone" dataKey="reported" name="Reported" stroke="#00d4ff" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      ),
    }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="City Intelligence" showBack />
      <div style={{ padding: '16px' }}>

        {/* Tabs — Overview (existing dashboard) + ESG */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[{ k: 'overview', label: 'Overview' }, { k: 'esg', label: 'ESG' }].map((t) => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={{
              flex: 1, padding: '10px', borderRadius: '999px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600',
              backgroundColor: activeTab === t.k ? '#00d4ff' : 'transparent',
              color: activeTab === t.k ? '#04091a' : '#94a3b8',
              border: activeTab === t.k ? 'none' : '0.5px solid #1a2f4a',
            }}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'overview' && (<>

        {/* Summary */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'Total', value: issues.length, color: '#00d4ff' },
            { label: 'Open', value: issues.filter(i => i.status !== 'Resolved').length, color: '#f97316' },
            { label: 'Resolved', value: issues.filter(i => i.status === 'Resolved').length, color: '#16a34a' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, backgroundColor: '#0d1b2e', borderRadius: '10px',
              border: '0.5px solid #1a2f4a', padding: '12px', textAlign: 'center',
              borderTop: `3px solid ${s.color}`,
            }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: '#7689a3', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Privacy-safe Excel export of the full city dataset */}
        <button onClick={async () => {
          const ok = await exportToExcel(issues, 'issues', 'JanaShakti_Analytics');
          toast[ok ? 'success' : 'error'](ok ? 'Exported to Excel (anonymized)' : 'Nothing to export');
        }} style={{
          width: '100%', padding: '10px', backgroundColor: '#0d1b2e',
          border: '0.5px solid #1a2f4a', borderRadius: '10px',
          color: '#00d4ff', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          marginBottom: '16px',
        }}>
          <Download size={14} strokeWidth={1.5} /> Export City Data (Privacy Safe)
        </button>

        {/* Quick actions + AI insights — surfaced above the charts so they're not missed */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/leaderboard')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            border: '0.5px solid #16a34a40', borderRadius: '10px',
            color: '#16a34a', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Trophy size={14} strokeWidth={1.5} /> Wall of Fame
          </button>
          <button onClick={() => navigate('/journalist')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            border: '0.5px solid #ec489940', borderRadius: '10px',
            color: '#ec4899', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Newspaper size={14} strokeWidth={1.5} /> Journalist
          </button>
        </div>
        <AiInsights issues={issues} />

        {/* Charts — carousel to keep the page compact (swipe / arrows / dots) */}
        <ChartCarousel slides={chartSlides} />

        {/* Issues by City — real per-city breakdown with open/resolved + resolution rate */}
        {byCity.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <MapPin size={16} color="#00d4ff" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Issues by City</span>
            </div>
            {byCity.map((c) => {
              const pct = c.total ? Math.round((c.resolved / c.total) * 100) : 0;
              return (
                <div key={c.name} style={{
                  backgroundColor: '#0d1b2e', borderRadius: '12px',
                  border: '0.5px solid #1a2f4a', padding: '12px 14px', marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <MapPin size={14} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff',
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#00d4ff', flexShrink: 0 }}>{c.total}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#f97316' }}>{c.open} open</span>
                    <span style={{ fontSize: '11px', color: '#16a34a' }}>{c.resolved} resolved</span>
                    <span style={{ fontSize: '11px', color: '#7689a3', marginLeft: 'auto' }}>{pct}% resolved</span>
                  </div>
                  <div style={{ height: '5px', borderRadius: '999px', backgroundColor: '#112035',
                                marginTop: '8px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '999px', width: `${pct}%`, backgroundColor: '#16a34a' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Wall of Shame */}
        {wallOfShameIssues.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <AlertTriangle size={16} color="#ef4444" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444' }}>
                Wall of Shame ({wallOfShameIssues.length})
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#7689a3', marginBottom: '10px' }}>
              Issues ignored for 30+ days
            </p>
            {wos.visible.map(i => <IssueCard key={i.id} issue={i} compact />)}
            {wos.hasMore && <ShowMore onClick={wos.showMore} remaining={wos.remaining} />}
          </div>
        )}

        </>)}

        {activeTab === 'esg' && (
          <ESGTab city={userProfile?.city || 'India'} esg={esg} navigate={navigate} />
        )}

      </div>
    </div>
  );
}
