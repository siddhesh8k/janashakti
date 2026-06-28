import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import InstallBanner from './components/InstallBanner';
import VoiceAssistant from './components/VoiceAssistant';
import { ToastProvider } from './components/ToastProvider';
import { LocationProvider } from './components/LocationProvider';

const HomeScreen         = lazy(() => import('./screens/HomeScreen'));
const ReportScreen       = lazy(() => import('./screens/ReportScreen'));
const MapScreen          = lazy(() => import('./screens/MapScreen'));
const ProfileScreen      = lazy(() => import('./screens/ProfileScreen'));
const IssueDetail        = lazy(() => import('./screens/IssueDetail'));
const AnalyticsDashboard = lazy(() => import('./screens/AnalyticsDashboard'));
const AuthorityDashboard = lazy(() => import('./screens/AuthorityDashboard'));
const AgentsShowcase     = lazy(() => import('./screens/AgentsShowcase'));
const Onboarding         = lazy(() => import('./screens/Onboarding'));
const Leaderboard        = lazy(() => import('./screens/Leaderboard'));
const JournalistDashboard = lazy(() => import('./screens/JournalistDashboard'));
const NotificationsScreen = lazy(() => import('./screens/NotificationsScreen'));

const HIDE_NAV_ROUTES = ['/onboarding', '/issue', '/analytics', '/authority', '/agents', '/leaderboard', '/journalist', '/notifications'];

function NavGuard() {
  const location = useLocation();
  const hide = HIDE_NAV_ROUTES.some(r => location.pathname.startsWith(r));
  if (hide) return null;
  return <BottomNav />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{
        maxWidth: '480px', margin: '0 auto',
        minHeight: '100vh', backgroundColor: '#080f1e',
        position: 'relative',
      }}>
        <ErrorBoundary>
          <ToastProvider>
          <LocationProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/"           element={<HomeScreen />} />
              <Route path="/report"     element={<ReportScreen />} />
              <Route path="/map"        element={<MapScreen />} />
              <Route path="/profile"    element={<ProfileScreen />} />
              <Route path="/issue/:id"  element={<IssueDetail />} />
              <Route path="/analytics"  element={<AnalyticsDashboard />} />
              <Route path="/authority"  element={<AuthorityDashboard />} />
              <Route path="/agents"     element={<AgentsShowcase />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/journalist" element={<JournalistDashboard />} />
              <Route path="/notifications" element={<NotificationsScreen />} />
              <Route path="/onboarding" element={<Onboarding />} />
            </Routes>
          </Suspense>
          <NavGuard />
          <InstallBanner />
          <VoiceAssistant />
          </LocationProvider>
          </ToastProvider>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}
