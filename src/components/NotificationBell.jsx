import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useUser } from '../hooks/useUser';
import { useNotifications } from '../hooks/useNotifications';

// Bell + unread badge for the home top nav. Unread = derived notifications newer
// than the user's notificationsSeenAt (set when they open /notifications).
export default function NotificationBell({ uid }) {
  const navigate = useNavigate();
  const { profile } = useUser(uid);
  const { items } = useNotifications(uid);

  const seenAt = profile?.notificationsSeenAt;
  const unread = items.filter(i =>
    !seenAt || new Date(i.time).getTime() > new Date(seenAt).getTime()
  ).length;

  return (
    <button onClick={() => navigate('/notifications')} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      display: 'flex', position: 'relative',
    }}>
      <Bell size={22} color="#f0f6ff" strokeWidth={1.5} />
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: '-5px', right: '-5px',
          minWidth: '16px', height: '16px', padding: '0 4px', boxSizing: 'border-box',
          borderRadius: '999px', backgroundColor: '#ef4444', color: '#ffffff',
          fontSize: '10px', fontWeight: '700', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #04091a',
        }}>{unread > 9 ? '9+' : unread}</span>
      )}
    </button>
  );
}
