import { memo } from 'react';
import { Target } from 'lucide-react';
import { SDG_COLORS, ESG_GRADES } from '../constants/esg';

// Highest grade whose threshold the score clears (ESG_GRADES is sorted desc by min).
const gradeFor = (score) =>
  ESG_GRADES.find((g) => score >= g.min) || ESG_GRADES[ESG_GRADES.length - 1];

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '0.0');

const PILLARS = [
  { key: 'E', label: 'Environmental', color: '#4C9F38' },
  { key: 'S', label: 'Social',        color: '#DD1367' },
  { key: 'G', label: 'Governance',    color: '#00689D' },
];

function ESGScoreCard({ esgScore }) {
  if (!esgScore) return null;

  const overall = Number(esgScore.overall_esg) || 0;
  const grade = gradeFor(overall);

  const rows = [
    { ...PILLARS[0], score: esgScore.e_score, impact: esgScore.e_impact, metric: esgScore.e_metric },
    { ...PILLARS[1], score: esgScore.s_score, impact: esgScore.s_impact, metric: esgScore.s_metric },
    { ...PILLARS[2], score: esgScore.g_score, impact: esgScore.g_impact, metric: esgScore.g_metric },
  ];

  const tags = esgScore.sdg_tags || [];
  const names = esgScore.sdg_names || [];

  return (
    <div style={{
      backgroundColor: '#0d1b2e', borderRadius: '14px',
      border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '10px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={18} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#f0f6ff' }}>ESG Impact</span>
        </div>
        <span style={{
          backgroundColor: grade.color, color: '#ffffff',
          borderRadius: '999px', padding: '4px 12px',
          fontSize: '13px', fontWeight: '700',
        }}>
          {fmt(overall)} · {grade.grade}
        </span>
      </div>

      {/* E / S / G rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '7px',
              backgroundColor: r.color, color: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: '700',
            }}>
              {r.key}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: r.color }}>{fmt(r.score)}/10</span>
                <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280' }}>{r.label}</span>
              </div>
              {r.impact && (
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, margin: '2px 0 0' }}>
                  {r.impact}
                </p>
              )}
              {r.metric && (
                <p style={{ fontSize: '11px', color: r.color, fontStyle: 'italic', margin: '2px 0 0' }}>
                  {r.metric}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: '0.5px', backgroundColor: '#1a2f4a', border: 'none', margin: '14px 0' }} />

      {/* SDG alignment */}
      {tags.length > 0 && (
        <div>
          <div style={{
            fontSize: '11px', fontWeight: '500', color: '#4a6280',
            letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '8px',
          }}>
            SDG Alignment
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map((tag, i) => {
              const c = SDG_COLORS[tag] || '#4a6280';
              return (
                <span key={tag} title={names[i] || tag} style={{
                  backgroundColor: c + '25', color: c,
                  border: `0.5px solid ${c}60`, borderRadius: '999px',
                  padding: '2px 8px', fontSize: '11px', fontWeight: '600',
                }}>
                  {tag}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Highlight */}
      {esgScore.highlight && (
        <p style={{
          fontSize: '13px', color: '#7ee8fa', fontStyle: 'italic', lineHeight: 1.5,
          margin: '12px 0 0', paddingLeft: '10px', borderLeft: '2px solid #00d4ff40',
        }}>
          {esgScore.highlight}
        </p>
      )}
    </div>
  );
}

export default memo(ESGScoreCard);
