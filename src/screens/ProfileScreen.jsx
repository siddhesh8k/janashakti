import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, setDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { Shield, Star, Award, Lock, LogOut, Eye, Trophy, Zap, Flame,
         Building2, GraduationCap, Users, Pencil,
         Twitter, MessageCircle, Linkedin, Facebook, Send } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUser } from '../hooks/useUser';
import { useIssues } from '../hooks/useIssues';
import { db, logOut } from '../firebase';
import { createOrganization } from '../utils/organizations';
import { mirrorPublicIdentity } from '../utils/publicProfile';
import TopNav from '../components/TopNav';
import Avatar from '../components/Avatar';
import AffiliationPicker from '../components/AffiliationPicker';
import IssueCard from '../components/IssueCard';
import StatsCard from '../components/StatsCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';
import { BADGE_CONDITIONS, LEVEL_THRESHOLDS } from '../constants/issueTypes';

const BADGE_ICONS = {
  first_step: Zap, keen_eye: Eye, guardian: Shield, community_star: Star,
  streak_hero: Trophy, social_voice: Award, verifier: Eye,
  city_champion: Shield, legend: Star,
};

export default function ProfileScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUser(user?.uid);
  const { issues, loading: issuesLoading } = useIssues({
    userId: user?.uid, limitCount: 5,
  });
  const [signingOut, setSigningOut] = useState(false);

  // Self-heal the "Reported" count from the real issue docs. The stored counter can
  // drift if an increment was ever missed (e.g. a report written before the profile
  // doc existed). Server-side count (not the capped feed); writes only on mismatch.
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !profile) return;
    let active = true;
    (async () => {
      try {
        const snap = await getCountFromServer(query(collection(db, 'issues'), where('userId', '==', uid)));
        const actual = snap.data().count;
        if (active && actual !== (profile.issuesReported || 0)) {
          await setDoc(doc(db, 'users', uid), { issuesReported: actual }, { merge: true });
        }
      } catch (e) { console.error('[profile reconcile]:', e); }
    })();
    return () => { active = false; };
  }, [user?.uid, profile?.issuesReported]);

  const [editingAff, setEditingAff] = useState(false);
  const [affDraft, setAffDraft] = useState(null);
  const [savingAff, setSavingAff] = useState(false);

  const startEditAff = () => {
    const a = profile?.affiliation;
    setAffDraft({
      role: a?.role || 'civilian',
      orgId: a?.orgId || null,
      orgName: a?.orgName || null,
      orgType: a?.orgType || null,
      draft: null,
    });
    setEditingAff(true);
  };

  const saveAffiliation = async () => {
    if (!user?.uid || !affDraft) return;
    setSavingAff(true);
    try {
      let aff = {
        role: affDraft.role || 'civilian',
        orgId: affDraft.orgId || null,
        orgName: affDraft.orgName || null,
        orgType: affDraft.orgType || null,
      };
      if (affDraft.draft) {
        const org = await createOrganization(affDraft.draft);
        aff = { role: affDraft.role, orgId: org.id, orgName: org.name, orgType: org.type };
      }
      await updateDoc(doc(db, 'users', user.uid), { affiliation: aff });
      await mirrorPublicIdentity(user.uid, {
        displayName: user.displayName, photoURL: user.photoURL,
      });
      setEditingAff(false);
      toast.success('Affiliation saved');
    } catch (err) {
      console.error('[Affiliation save]:', err);
      toast.error('Could not save affiliation. Try again.');
    }
    setSavingAff(false);
  };

  if (authLoading || profileLoading) return <LoadingSkeleton count={3} />;

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#080f1e',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <p style={{ color: '#f0f6ff', fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
          Sign in to see your profile
        </p>
        <button onClick={() => navigate('/')} style={{
          backgroundColor: '#00d4ff', color: '#04091a', border: 'none',
          borderRadius: '10px', padding: '12px 24px', fontWeight: '600',
          cursor: 'pointer',
        }}>Go to Home</button>
      </div>
    );
  }

  const level = LEVEL_THRESHOLDS.find(l =>
    (profile?.civicScore || 0) >= l.min && (profile?.civicScore || 0) <= l.max
  ) || LEVEL_THRESHOLDS[0];

  const nextLevel = LEVEL_THRESHOLDS.find(l => l.min > (profile?.civicScore || 0));
  const progressPercent = nextLevel
    ? ((profile?.civicScore || 0) - level.min) / (nextLevel.min - level.min) * 100
    : 100;

  const handleSignOut = async () => {
    if (!window.confirm('Sign out of JanaShakti?')) return;
    setSigningOut(true);
    try {
      await logOut();
      toast.success('Signed out');
      navigate('/');
    } catch (err) {
      console.error('[SignOut]:', err);
      toast.error('Sign-out failed. Try again.');
    }
    setSigningOut(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
      <TopNav title="Profile" />

      <div style={{ padding: '16px' }}>
        {/* Header card */}
        <div style={{
          backgroundColor: '#0d1b2e', borderRadius: '14px',
          border: '0.5px solid #1a2f4a', padding: '20px',
          textAlign: 'center', marginBottom: '12px',
        }}>
          <Avatar src={user.photoURL} name={user.displayName} size={72}
            ring="3px solid #16a34a" textColor="#00d4ff"
            style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#f0f6ff', marginBottom: '4px' }}>
            {user.displayName || 'Citizen'}
          </h2>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            backgroundColor: '#00d4ff1a', borderRadius: '999px',
            padding: '4px 12px',
          }}>
            <Shield size={12} color="#00d4ff" strokeWidth={1.5} />
            <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: '600' }}>
              {level.name}
            </span>
          </div>
          {user.isAnonymous && (
            <p style={{ fontSize: '11px', color: '#4a6280', marginTop: '8px' }}>
              Guest Account
            </p>
          )}
        </div>

        {/* Civic score card */}
        <div style={{
          backgroundColor: '#0d1b2e', borderRadius: '14px',
          border: '0.5px solid #1a2f4a', padding: '20px',
          textAlign: 'center', marginBottom: '12px',
        }}>
          <div style={{ fontSize: '44px', fontWeight: '800', color: '#00d4ff' }}>
            {profile?.civicScore || 0}
          </div>
          <div style={{ fontSize: '11px', color: '#4a6280', textTransform: 'uppercase',
                        letterSpacing: '0.7px', marginBottom: '12px' }}>Civic Score</div>
          <div style={{ height: '6px', backgroundColor: '#1a2f4a', borderRadius: '3px',
                        overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${progressPercent}%`, height: '100%',
                          backgroundColor: '#00d4ff', borderRadius: '3px',
                          transition: 'width 0.5s ease' }} />
          </div>
          {nextLevel && (
            <span style={{ fontSize: '11px', color: '#4a6280' }}>
              {nextLevel.min - (profile?.civicScore || 0)} pts to {nextLevel.name}
            </span>
          )}
        </div>

        {/* Streak card */}
        {(profile?.streak || 0) > 0 && (
          <div style={{
            backgroundColor: '#0d1b2e', borderRadius: '14px',
            border: '0.5px solid #f9731640', padding: '14px 16px', marginBottom: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Flame size={24} color="#f97316" strokeWidth={1.5} />
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#f0f6ff' }}>
                  {profile.streak} day streak
                </div>
                <div style={{ fontSize: '11px', color: '#4a6280' }}>+2 pts/day bonus active</div>
              </div>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#86efac' }}>
              +{profile.streak * 2} bonus pts
            </span>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <StatsCard label="Reported" value={profile?.issuesReported || 0} color="#00d4ff" />
          <StatsCard label="Verified" value={profile?.issuesVerified || 0} color="#3b82f6" />
          <StatsCard label="Resolved" value={profile?.issuesResolved || 0} color="#16a34a" />
        </div>

        {/* Affiliation */}
        <div style={{
          backgroundColor: '#0d1b2e', borderRadius: '14px',
          border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: editingAff ? '12px' : '0' }}>
            <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                           textTransform: 'uppercase', letterSpacing: '0.7px' }}>Affiliation</span>
            {!editingAff && (
              <button onClick={startEditAff} style={{
                background: 'none', border: 'none', color: '#00d4ff', cursor: 'pointer',
                fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Pencil size={13} strokeWidth={1.5} /> Edit
              </button>
            )}
          </div>

          {editingAff ? (
            <>
              <AffiliationPicker value={affDraft} onChange={setAffDraft} />
              <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
                <button onClick={saveAffiliation} disabled={savingAff} style={{
                  flex: 1, padding: '11px', backgroundColor: '#00d4ff', color: '#04091a',
                  border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                  cursor: savingAff ? 'wait' : 'pointer',
                }}>{savingAff ? 'Saving…' : 'Save'}</button>
                <button onClick={() => setEditingAff(false)} disabled={savingAff} style={{
                  padding: '11px 16px', backgroundColor: 'transparent', color: '#94a3b8',
                  border: '0.5px solid #1a2f4a', borderRadius: '10px',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              {profile?.affiliation?.orgType === 'college'
                ? <GraduationCap size={18} color="#00d4ff" strokeWidth={1.5} />
                : profile?.affiliation?.orgType === 'company'
                  ? <Building2 size={18} color="#00d4ff" strokeWidth={1.5} />
                  : <Users size={18} color="#94a3b8" strokeWidth={1.5} />}
              <span style={{ fontSize: '14px', color: '#f0f6ff', fontWeight: '600' }}>
                {profile?.affiliation?.orgName
                  ? `${(profile.affiliation.role || '').replace(/^\w/, c => c.toUpperCase())} · ${profile.affiliation.orgName}`
                  : 'Civilian'}
              </span>
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         textTransform: 'uppercase', letterSpacing: '0.7px' }}>BADGES</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px', marginTop: '10px' }}>
            {BADGE_CONDITIONS.map(badge => {
              const unlocked = profile ? badge.condition(profile) : false;
              const Icon = BADGE_ICONS[badge.id] || Award;
              return (
                <div key={badge.id} style={{
                  backgroundColor: '#0d1b2e', borderRadius: '10px',
                  border: '0.5px solid #1a2f4a', padding: '12px',
                  textAlign: 'center', opacity: unlocked ? 1 : 0.4,
                }}>
                  {unlocked ? (
                    <Icon size={24} color="#00d4ff" strokeWidth={1.5} />
                  ) : (
                    <Lock size={24} color="#4a6280" strokeWidth={1.5} />
                  )}
                  <div style={{ fontSize: '10px', color: unlocked ? '#f0f6ff' : '#4a6280',
                                marginTop: '4px', fontWeight: '500' }}>
                    {badge.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Superpowers — reach the citizen commands, framed from existing level + badges */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         textTransform: 'uppercase', letterSpacing: '0.7px' }}>SUPERPOWERS</span>
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '12px',
                        border: '0.5px solid #1a2f4a', padding: '14px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Zap size={18} color="#00d4ff" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>{level.name}</span>
              <span style={{ fontSize: '11px', color: '#4a6280' }}>· power tier</span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                          letterSpacing: '0.7px', marginBottom: '8px' }}>AMPLIFY REACH</div>
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px' }}>
              {[
                { label: 'X', icon: Twitter, color: '#00d4ff' },
                { label: 'WhatsApp', icon: MessageCircle, color: '#16a34a' },
                { label: 'LinkedIn', icon: Linkedin, color: '#3b82f6' },
                { label: 'Facebook', icon: Facebook, color: '#60a5fa' },
                { label: 'Telegram', icon: Send, color: '#7ee8fa' },
              ].map(({ label, icon: Icon, color }) => {
                const unlocked = (profile?.issuesShared || 0) >= 3;
                return (
                  <div key={label} style={{
                    flex: 1, minWidth: 0, justifyContent: 'center',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '6px 6px', borderRadius: '999px',
                    backgroundColor: color + '1a', border: '0.5px solid ' + color + '40',
                    opacity: unlocked ? 1 : 0.5,
                  }}>
                    <Icon size={13} color={color} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span title={label} style={{ fontSize: '11px', color: '#f0f6ff', fontWeight: '600',
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px',
                          color: (profile?.issuesShared || 0) >= 3 ? '#86efac' : '#4a6280' }}>
              {(profile?.issuesShared || 0) >= 3
                ? 'Social Voice unlocked — your shares amplify civic issues.'
                : `Share ${Math.max(0, 3 - (profile?.issuesShared || 0))} more to unlock the Social Voice power.`}
            </div>
          </div>
        </div>

        {/* My reports */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: '12px', marginTop: '20px' }}>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#f0f6ff' }}>My Reports</span>
        </div>
        {issuesLoading ? <LoadingSkeleton count={2} /> :
          issues.length === 0 ? <EmptyState title="No reports yet" message="Start reporting!" /> :
          issues.map(i => <IssueCard key={i.id} issue={i} compact />)
        }

        {/* Sign out */}
        <button onClick={handleSignOut} disabled={signingOut} style={{
          width: '100%', padding: '12px', backgroundColor: 'transparent',
          color: '#ef4444', border: '1px solid #ef4444', borderRadius: '10px',
          fontSize: '14px', fontWeight: '500', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginTop: '24px',
        }}>
          <LogOut size={16} strokeWidth={1.5} />
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
