import { ChevronDown } from 'lucide-react';

// Cyan outline "Show more" button — matches the app's secondary-button style.
export default function ShowMore({ onClick, remaining }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '11px', marginTop: '4px', marginBottom: '8px',
      backgroundColor: 'transparent', color: '#00d4ff',
      border: '0.5px solid #1a2f4a', borderRadius: '10px',
      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    }}>
      <ChevronDown size={15} strokeWidth={1.5} />
      Show more{remaining ? ` (${remaining} more)` : ''}
    </button>
  );
}
