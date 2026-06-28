import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { Bell, Clock, CheckCircle, ShieldAlert, Users, Twitter } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import TopNav from '../components/TopNav';
import EmptyState from '../components/EmptyState';

const KIND_ICON = {
  status:     { icon: Clock,       color: '#3b82f6' },
  resolved:   { icon: CheckCircle, color: '#16a34a' },
  milestone:  { icon: Users,       color: '#00d4ff' },
  escalation: { icon: ShieldAlert, color: '#f97316' },
  social:     { icon: Twitter,     color: '#00d4ff' },
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items } = useNotifications(user?.uid);

  // Mark everything seen when the screen opens (clears the bell badge).
  useEffect(() => {
    if (!user?.uid) return;
    updateDoc(doc(db, 'users', user.uid), {
      notificationsSeenAt: new Date().toISOString(),
    }).catch((err) => console.error('[Notifications seen]:', err));
  }, [user?.uid]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="Notifications" showBack />
      <div style={{ padding: '16px' }}>
        {items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            message="Updates on your reported issues will show up here."
          />
        ) : (
          items.map(n => {
            const { icon: Icon, color } = KIND_ICON[n.kind] || KIND_ICON.status;
            return (
              <div key={n.key} onClick={() => navigate(`/issue/${n.issueId}`)} style={{
                backgroundColor: '#0d1b2e', borderRadius: '14px',
                border: '0.5px solid #1a2f4a', borderLeft: `3px solid ${color}`,
                padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
                display: 'flex', gap: '10px', alignItems: 'flex-start',
              }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                  backgroundColor: color + '1a', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} color={color} strokeWidth={1.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff', lineHeight: 1.35 }}>
                    {n.title}
                  </div>
                  {n.note && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.4 }}>
                      {n.note}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#4a6280', marginTop: '4px' }}>
                    {timeAgo(n.time)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
