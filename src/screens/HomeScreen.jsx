import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Search, MailCheck, BarChart3, AlertTriangle, ChevronRight,
         Eye, LogIn, UserPlus, Shield, ShieldCheck, Trophy, Newspaper } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useIssues } from '../hooks/useIssues';
import { useUser } from '../hooks/useUser';
import { useAgents } from '../hooks/useAgents';
import { signInWithGoogle, signInAsGuest, signInWithEmail, signUpWithEmail } from '../firebase';
import TopNav from '../components/TopNav';
import IssueCard from '../components/IssueCard';
import StatsCard from '../components/StatsCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';

export default function HomeScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useUser(user?.uid);
  const { issues, loading: issuesLoading } = useIssues({ limitCount: 10 });
  const { stats } = useAgents();
  const [authError, setAuthError] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading2, setAuthLoading2] = useState(false);
  const toastApi = useToast();
  const setToast = (t) => { if (t) toastApi.show(t.msg, t.type); };

  // Onboarding trigger: send first-time signed-in users through onboarding.
  useEffect(() => {
    if (user && profile && profile.onboardingComplete === false) {
      navigate('/onboarding');
    }
  }, [user, profile, navigate]);


  if (authLoading) return <LoadingSkeleton count={4} />;

  // ── NOT SIGNED IN ──
  if (!user) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: '#04091a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <img src="/logo.png" alt="JanaShakti" style={{
          width: '200px', marginBottom: '24px',
        }} />
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#00d4ff',
                     marginBottom: '4px' }}>JanaShakti</h1>
        <p style={{ fontSize: '13px', color: '#86efac', marginBottom: '32px' }}>
          जनशक्ति — People&apos;s Power
        </p>

        <button onClick={async () => {
          setAuthLoading2(true); setAuthError(null);
          try { await signInWithGoogle(); setToast({ msg: 'Signed in — welcome!', type: 'success' }); }
          catch (e) { setAuthError(e.message); setToast({ msg: e.message || 'Sign-in failed', type: 'error' }); }
          setAuthLoading2(false);
        }} style={{
          width: '100%', maxWidth: '320px', padding: '13px',
          backgroundColor: '#112035', color: '#f0f6ff',
          border: '0.5px solid #1a2f4a', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          marginBottom: '12px',
        }}>
          <LogIn size={18} strokeWidth={1.5} />
          Continue with Google
        </button>

        <button onClick={async () => {
          setAuthLoading2(true); setAuthError(null);
          try { await signInAsGuest(); setToast({ msg: 'Signed in as guest', type: 'success' }); }
          catch (e) { setAuthError(e.message); setToast({ msg: e.message || 'Sign-in failed', type: 'error' }); }
          setAuthLoading2(false);
        }} style={{
          width: '100%', maxWidth: '320px', padding: '12px',
          backgroundColor: 'transparent', color: '#00d4ff',
          border: '1px solid #00d4ff', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600', cursor: 'pointer',
          marginBottom: '16px',
        }}>
          Continue as Guest
        </button>
        <span style={{ fontSize: '11px', color: '#4a6280', marginBottom: '16px' }}>
          No account needed
        </span>

        <button onClick={() => setShowEmail(!showEmail)} style={{
          background: 'none', border: 'none', color: '#00d4ff',
          fontSize: '13px', cursor: 'pointer', marginBottom: '16px',
        }}>
          Sign in with Email
        </button>

        {showEmail && (
          <div style={{ width: '100%', maxWidth: '320px' }}>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" type="email"
              style={{
                width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
                border: '0.5px solid #1a2f4a', borderRadius: '10px',
                padding: '12px 14px', fontSize: '14px', marginBottom: '8px',
                outline: 'none', boxSizing: 'border-box',
              }} />
            <input value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" type="password"
              style={{
                width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
                border: '0.5px solid #1a2f4a', borderRadius: '10px',
                padding: '12px 14px', fontSize: '14px', marginBottom: '8px',
                outline: 'none', boxSizing: 'border-box', marginBottom: '12px',
              }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={async () => {
                setAuthLoading2(true); setAuthError(null);
                try { await signInWithEmail(email, password); setToast({ msg: 'Signed in — welcome back!', type: 'success' }); }
                catch (e) { setAuthError(e.message); setToast({ msg: e.message || 'Sign-in failed', type: 'error' }); }
                setAuthLoading2(false);
              }} style={{
                flex: 1, padding: '12px', backgroundColor: '#00d4ff', color: '#04091a',
                border: 'none', borderRadius: '10px', fontWeight: '600',
                fontSize: '13px', cursor: 'pointer',
              }}>Sign In</button>
              <button onClick={async () => {
                setAuthLoading2(true); setAuthError(null);
                try { await signUpWithEmail(email, password, email.split('@')[0]); setToast({ msg: 'Account created — welcome!', type: 'success' }); }
                catch (e) { setAuthError(e.message); setToast({ msg: e.message || 'Sign-up failed', type: 'error' }); }
                setAuthLoading2(false);
              }} style={{
                flex: 1, padding: '12px', backgroundColor: 'transparent',
                color: '#00d4ff', border: '1px solid #00d4ff',
                borderRadius: '10px', fontWeight: '600',
                fontSize: '13px', cursor: 'pointer',
              }}>Create Account</button>
            </div>
          </div>
        )}

        {authError && (
          <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '12px',
                      textAlign: 'center', maxWidth: '320px' }}>{authError}</p>
        )}
        {authLoading2 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              width: '24px', height: '24px',
              border: '2px solid #1a2f4a', borderTop: '2px solid #00d4ff',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        )}
      </div>
    );
  }

  // ── SIGNED IN ──
  const criticalIssues = issues.filter(i => i.severity === 'Critical');
  const resolvedCount = issues.filter(i => i.status === 'Resolved').length;

  const AGENTS = [
    { icon: Bot, name: 'Analyzer', count: stats.analyzed },
    { icon: Search, name: 'Detector', count: stats.duplicatesCaught },
    { icon: MailCheck, name: 'Router', count: stats.authoritiesNotified },
    { icon: BarChart3, name: 'Predictor', count: stats.predictionsGenerated },
    { icon: ShieldCheck, name: 'Verifier', count: stats.resolutionsVerified },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
      <TopNav user={user} />

      <div style={{ padding: '0 16px' }}>
        {/* Agent Status Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginTop: '16px', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         letterSpacing: '0.7px', textTransform: 'uppercase' }}>AI AGENTS</span>
          <button onClick={() => navigate('/agents')} style={{
            background: 'none', border: 'none', color: '#00d4ff',
            fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px',
          }}>See all <ChevronRight size={14} strokeWidth={1.5} /></button>
        </div>
        <div style={{ display: 'flex', gap: '6px', paddingBottom: '4px' }}>
          {AGENTS.map(a => (
            <button key={a.name} onClick={() => navigate('/agents')} title={`${a.name} — ${a.count} runs`} style={{
              flex: 1, minWidth: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
              borderRadius: '999px', padding: '7px 6px', cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              <a.icon size={13} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: '#f0f6ff', fontWeight: '500',
                             overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
              <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: '600', flexShrink: 0 }}>{a.count}</span>
            </button>
          ))}
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginTop: '16px', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         letterSpacing: '0.7px', textTransform: 'uppercase' }}>COMMUNITY</span>
          <button onClick={() => navigate('/leaderboard')} style={{
            background: 'none', border: 'none', color: '#00d4ff',
            fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
          }}>
            <Trophy size={13} strokeWidth={1.5} /> Wall of Fame
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <StatsCard label="Issues" value={issues.length} color="#00d4ff" />
          <StatsCard label="Resolved" value={resolvedCount} color="#16a34a" />
          <StatsCard label="My Score" value={profile?.civicScore || 0} color="#00d4ff" />
        </div>

        {/* Critical Alerts */}
        {criticalIssues.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
                          marginTop: '20px', marginBottom: '10px' }}>
              <AlertTriangle size={14} color="#ef4444" strokeWidth={1.5} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444',
                             textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                CRITICAL ALERTS
              </span>
            </div>
            <div style={{ overflowX: 'auto', display: 'flex', gap: '10px',
                          paddingBottom: '4px', paddingRight: '2px' }}>
              {criticalIssues.slice(0, 3).map(issue => (
                <div key={issue.id} style={{ width: '280px', maxWidth: '85vw', flexShrink: 0, display: 'flex' }}>
                  <IssueCard issue={issue} compact fillHeight />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Explore shortcuts — surfaced above the feed so they're not missed */}
        <div style={{ marginTop: '20px', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         letterSpacing: '0.7px', textTransform: 'uppercase' }}>EXPLORE</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button onClick={() => navigate('/authority')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Shield size={14} strokeWidth={1.5} /> Authority View
          </button>
          <button onClick={() => navigate('/analytics')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <BarChart3 size={14} strokeWidth={1.5} /> Analytics
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/leaderboard')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Trophy size={14} strokeWidth={1.5} /> Wall of Fame
          </button>
          <button onClick={() => navigate('/journalist')} style={{
            flex: 1, padding: '12px', backgroundColor: '#0d1b2e',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Newspaper size={14} strokeWidth={1.5} /> Journalist
          </button>
        </div>

        {/* Recent Issues */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginTop: '20px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#f0f6ff' }}>
            Recent Issues
          </span>
          <button onClick={() => navigate('/analytics')} style={{
            background: 'none', border: 'none', color: '#00d4ff',
            fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px',
          }}>See all <ChevronRight size={14} strokeWidth={1.5} /></button>
        </div>

        {issuesLoading ? (
          <LoadingSkeleton count={3} />
        ) : issues.length === 0 ? (
          <EmptyState title="No issues reported yet"
            message="Tap the Report button to start" />
        ) : (
          issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
        )}

      </div>
    </div>
  );
}
