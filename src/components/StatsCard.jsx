import { memo } from 'react';

function StatsCard({ label, value, color = '#00d4ff', icon: Icon }) {
  return (
    <div style={{
      backgroundColor: '#0d1b2e', borderRadius: '10px',
      border: '0.5px solid #1a2f4a', padding: '12px',
      textAlign: 'center', flex: 1,
      borderTop: `3px solid ${color}`,
    }}>
      {Icon && <Icon size={16} color={color} strokeWidth={1.5} style={{ marginBottom: '4px' }} />}
      <div style={{ fontSize: '22px', fontWeight: '700', color, lineHeight: 1.2 }}>
        {value ?? 0}
      </div>
      <div style={{
        fontSize: '10px', fontWeight: '500', color: '#4a6280',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px',
      }}>
        {label}
      </div>
    </div>
  );
}

export default memo(StatsCard);
