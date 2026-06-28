import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Avatar from './Avatar';
import NotificationBell from './NotificationBell';

export default function TopNav({ title, showBack = false, rightElement, user }) {
  const navigate = useNavigate();

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      backgroundColor: '#04091a',
      borderBottom: '0.5px solid #1a2f4a',
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showBack ? (
          <button onClick={() => navigate(-1)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', display: 'flex',
          }}>
            <ChevronLeft size={24} color="#f0f6ff" strokeWidth={1.5} />
          </button>
        ) : (
          <img src="/logo.png" alt="JanaShakti" style={{
            height: '28px', width: '28px', objectFit: 'contain', borderRadius: '6px',
          }} />
        )}
        <span style={{
          fontSize: showBack ? '16px' : '18px',
          fontWeight: '700', color: showBack ? '#f0f6ff' : '#00d4ff',
        }}>
          {title || 'JanaShakti'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {rightElement}
        {user && !showBack && <NotificationBell uid={user.uid} />}
        {user && !showBack && (
          <button onClick={() => navigate('/profile')} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex',
          }}>
            <Avatar src={user.photoURL} name={user.displayName} size={28}
              ring="1.5px solid #1a2f4a" textColor="#4a6280" />
          </button>
        )}
      </div>
    </div>
  );
}
