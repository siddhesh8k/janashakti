import { memo } from 'react';
import { SDG_COLORS } from '../constants/esg';

function SDGBadge({ sdgId, name, size = 'md' }) {
  const color = SDG_COLORS[sdgId] || '#4a6280';
  const sm = size === 'sm';

  return (
    <span style={{
      display: 'inline-block', whiteSpace: 'nowrap',
      backgroundColor: color + '20', color,
      border: `0.5px solid ${color}50`, borderRadius: '999px',
      padding: sm ? '2px 8px' : '4px 12px',
      fontSize: sm ? '10px' : '12px', fontWeight: '600',
    }}>
      {sdgId}{size === 'md' && name ? ` · ${name}` : ''}
    </span>
  );
}

export default memo(SDGBadge);
