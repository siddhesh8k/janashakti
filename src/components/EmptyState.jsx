import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'No items yet', message = '', icon: Icon = Inbox }) {
  return (
    <div style={{
      textAlign: 'center', padding: '40px 20px',
    }}>
      <Icon size={48} color="#1a2f4a" strokeWidth={1} style={{ marginBottom: '12px' }} />
      <p style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff', marginBottom: '4px' }}>
        {title}
      </p>
      {message && (
        <p style={{ fontSize: '13px', color: '#4a6280' }}>{message}</p>
      )}
    </div>
  );
}
