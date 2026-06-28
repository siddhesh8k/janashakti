import { memo, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Bot, MapPin, Clock, Zap,
         Activity, ShieldAlert, Droplets, Trash2, Lightbulb, Shield, Construction,
         Sparkles, Trophy, Newspaper, Download } from 'lucide-react';
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
        <p style={{ fontSize: '12px', color: '#4a6280' }}>Insights unavailable right now — try again later.</p>
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

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { issues, loading } = useIssues({ limitCount: 100 });

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
  const noData = <p style={{ color: '#4a6280', fontSize: '12px' }}>No data</p>;
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
            <XAxis dataKey="name" tick={{ fill: '#4a6280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4a6280', fontSize: 10 }} axisLine={false} tickLine={false} />
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
            <XAxis dataKey="week" tick={{ fill: '#4a6280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4a6280', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
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
              <div style={{ fontSize: '10px', color: '#4a6280', textTransform: 'uppercase' }}>{s.label}</div>
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

        {/* Wall of Shame */}
        {wallOfShameIssues.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <AlertTriangle size={16} color="#ef4444" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444' }}>
                Wall of Shame ({wallOfShameIssues.length})
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#4a6280', marginBottom: '10px' }}>
              Issues ignored for 30+ days
            </p>
            {wos.visible.map(i => <IssueCard key={i.id} issue={i} compact />)}
            {wos.hasMore && <ShowMore onClick={wos.showMore} remaining={wos.remaining} />}
          </div>
        )}

      </div>
    </div>
  );
}
