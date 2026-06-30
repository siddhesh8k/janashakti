import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Camera, Map, User } from 'lucide-react';

const TABS = [
  { path: '/',        icon: Home,   label: 'Home' },
  { path: '/report',  icon: Camera, label: 'Report', special: true },
  { path: '/map',     icon: Map,    label: 'Map' },
  { path: '/profile', icon: User,   label: 'Profile' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%',
      transform: 'translateX(-50%)',
      width: '100%', maxWidth: '480px',
      backgroundColor: '#04091a',
      borderTop: '0.5px solid #1a2f4a',
      display: 'flex', height: '64px', zIndex: 100,
    }}>
      {TABS.map((tab) => {
        const active = location.pathname === tab.path;
        const Icon = tab.icon;

        if (tab.special) {
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'transparent', border: 'none',
                cursor: 'pointer', gap: '4px',
              }}>
              <Icon size={22} color={active ? '#00d4ff' : '#7689a3'} strokeWidth={1.5} />
              <span style={{
                fontSize: '10px', fontWeight: active ? '600' : '400',
                color: active ? '#00d4ff' : '#7689a3',
              }}>{tab.label}</span>
            </button>
          );
        }

        return (
          <button key={tab.path} onClick={() => navigate(tab.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'transparent', border: 'none',
              cursor: 'pointer', gap: '4px',
            }}>
            <Icon size={22} color={active ? '#00d4ff' : '#7689a3'} strokeWidth={1.5} />
            <span style={{
              fontSize: '10px', fontWeight: active ? '600' : '400',
              color: active ? '#00d4ff' : '#7689a3',
            }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
