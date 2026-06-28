import { memo } from 'react';
import { Users } from 'lucide-react';

const THRESHOLD = 10;

function PressureMeter({ confirmations = 0, compact = false }) {
  const percent = Math.min((confirmations / THRESHOLD) * 100, 100);

  const getColor = () => {
    if (percent >= 75) return '#ef4444';
    if (percent >= 50) return '#f97316';
    if (percent >= 25) return '#eab308';
    return '#22c55e';
  };

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          flex: 1, height: '4px', backgroundColor: '#1a2f4a',
          borderRadius: '2px', overflow: 'hidden',
        }}>
          <div style={{
            width: `${percent}%`, height: '100%',
            backgroundColor: getColor(),
            borderRadius: '2px',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <span style={{ fontSize: '10px', color: '#4a6280', fontWeight: '600' }}>
          {Math.round(percent)}%
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Users size={12} color="#4a6280" strokeWidth={1.5} />
          <span style={{ fontSize: '11px', color: '#4a6280' }}>
            {confirmations} confirmation{confirmations !== 1 ? 's' : ''}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: getColor(), fontWeight: '600' }}>
          {Math.round(percent)}%
        </span>
      </div>
      <div style={{
        width: '100%', height: '6px', backgroundColor: '#1a2f4a',
        borderRadius: '3px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${percent}%`, height: '100%',
          backgroundColor: getColor(),
          borderRadius: '3px',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default memo(PressureMeter);
