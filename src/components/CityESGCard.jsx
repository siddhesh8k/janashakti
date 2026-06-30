import { memo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ESG_GRADES } from '../constants/esg';

// Highest grade whose threshold the score clears (ESG_GRADES is sorted desc by min).
const gradeFor = (score) =>
  ESG_GRADES.find((g) => score >= g.min) || ESG_GRADES[ESG_GRADES.length - 1];

const rankColor = (rank) =>
  rank === 1 ? '#F59E0B' : rank === 2 ? '#9CA3AF' : rank === 3 ? '#CD7F32' : '#7689a3';

function CityESGCard({ rank, city, esgScore, issuesResolved, trend, highlight }) {
  const grade = gradeFor(Number(esgScore) || 0);

  return (
    <div style={{
      backgroundColor: '#0d1b2e', borderRadius: '12px',
      border: '0.5px solid #1a2f4a', padding: '12px 16px', marginBottom: '8px',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      {/* Rank */}
      <span style={{
        flexShrink: 0, minWidth: '34px', textAlign: 'center',
        fontSize: '20px', fontWeight: '800', color: rankColor(rank),
      }}>
        #{rank}
      </span>

      {/* City + highlight */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: '15px', fontWeight: '700', color: '#f0f6ff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {city}
        </div>
        {highlight && (
          <div title={highlight} style={{
            fontSize: '12px', color: '#94a3b8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {highlight}
          </div>
        )}
      </div>

      {/* Grade + trend + resolved count */}
      <div style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', gap: '4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            backgroundColor: grade.color + '1a', color: grade.color,
            border: `0.5px solid ${grade.color}40`, borderRadius: '999px',
            padding: '2px 10px', fontSize: '12px', fontWeight: '700',
          }}>
            {grade.grade}
          </span>
          {trend === 'up' && <TrendingUp size={16} color="#22c55e" strokeWidth={2} />}
          {trend === 'down' && <TrendingDown size={16} color="#ef4444" strokeWidth={2} />}
          {trend === 'same' && <span style={{ fontSize: '13px', color: '#7689a3' }}>–</span>}
        </div>
        <span style={{ fontSize: '11px', color: '#7689a3' }}>
          {issuesResolved || 0} resolved
        </span>
      </div>
    </div>
  );
}

export default memo(CityESGCard);
