import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { Camera, TrendingUp, Share2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { createOrganization } from '../utils/organizations';
import { mirrorPublicIdentity } from '../utils/publicProfile';
import AffiliationPicker from '../components/AffiliationPicker';
import NationTagline from '../components/NationTagline';

const FEATURES = [
  {
    icon: Camera, title: 'AI-Powered Reporting',
    desc: 'Take a photo. Gemini 2.5 Pro identifies the issue type, severity, and generates a complaint letter automatically.',
  },
  {
    icon: TrendingUp, title: 'Pressure Meter',
    desc: 'Every community confirmation builds pressure. Watch authorities respond as the meter climbs.',
  },
  {
    icon: Share2, title: 'Automatic Social Posts',
    desc: '@JanaShaktiApp posts your issue on X and LinkedIn, tagging the right authorities publicly.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [affiliation, setAffiliation] = useState({
    role: 'civilian', orgId: null, orgName: null, orgType: null, draft: null,
  });
  const [xHandle, setXHandle] = useState('');
  const [saving, setSaving] = useState(false);

  const handleComplete = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { navigate('/'); return; }
    setSaving(true);
    try {
      // Resolve a manually-added org (draft) into a real Firestore org first.
      let aff = {
        role: affiliation.role || 'civilian',
        orgId: affiliation.orgId || null,
        orgName: affiliation.orgName || null,
        orgType: affiliation.orgType || null,
      };
      if (affiliation.draft) {
        const org = await createOrganization(affiliation.draft);
        aff = { role: affiliation.role, orgId: org.id, orgName: org.name, orgType: org.type };
      }
      const data = { onboardingComplete: true, affiliation: aff };
      if (xHandle) data.xHandle = xHandle;
      await updateDoc(doc(db, 'users', uid), data);
      // Keep the public leaderboard mirror's identity fresh immediately.
      await mirrorPublicIdentity(uid, {
        displayName: auth.currentUser?.displayName,
        photoURL: auth.currentUser?.photoURL,
      });
    } catch (err) {
      console.error('[Onboarding]:', err);
    }
    setSaving(false);
    navigate('/');
  };

  // Affiliation is mandatory: civilian is fine on its own; student/employee must
  // pick (or add) an organization.
  const isAffiliationValid =
    affiliation.role === 'civilian' ||
    ((affiliation.role === 'student' || affiliation.role === 'employee') &&
      (!!affiliation.orgId || !!affiliation.draft));

  const inputStyle = {
    width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
    border: '0.5px solid #1a2f4a', borderRadius: '10px',
    padding: '12px 14px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#04091a',
      display: 'flex', flexDirection: 'column',
      padding: '40px 24px',
    }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '32px' }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: s <= step ? '#00d4ff' : '#1a2f4a',
            transition: 'background-color 0.3s',
          }} />
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', alignItems: 'center' }}>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <>
            <img src="/logo.png" alt="JanaShakti" style={{
              width: '200px', marginBottom: '24px',
            }} />
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f0f6ff',
                         marginBottom: '8px', textAlign: 'center' }}>
              Welcome to JanaShakti
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center',
                        lineHeight: 1.6, marginBottom: '20px', maxWidth: '300px' }}>
              A universal civic accountability platform — report issues, build community
              pressure, and hold those responsible accountable.
            </p>
            <NationTagline style={{ marginBottom: '32px' }} />
            <button onClick={() => setStep(2)} style={{
              width: '100%', maxWidth: '300px', padding: '14px',
              backgroundColor: '#00d4ff', color: '#04091a',
              border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            }}>Get Started</button>
          </>
        )}

        {/* STEP 2: Features */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#f0f6ff',
                         marginBottom: '20px', textAlign: 'center' }}>
              How it works
            </h2>
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} style={{
                  backgroundColor: '#0d1b2e', borderRadius: '14px',
                  border: '0.5px solid #1a2f4a', padding: '16px',
                  marginBottom: '10px', width: '100%', maxWidth: '340px',
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    backgroundColor: '#00d4ff1a', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={18} color="#00d4ff" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff',
                                 marginBottom: '4px' }}>{f.title}</h3>
                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setStep(3)} style={{
              width: '100%', maxWidth: '340px', padding: '14px',
              backgroundColor: '#00d4ff', color: '#04091a',
              border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              marginTop: '16px',
            }}>Next</button>
          </>
        )}

        {/* STEP 3: Quick Setup */}
        {step === 3 && (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#f0f6ff',
                         marginBottom: '8px', textAlign: 'center' }}>
              Almost done!
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center',
                        marginBottom: '24px' }}>Tell us who you are</p>

            <div style={{ width: '100%', maxWidth: '340px' }}>
              <AffiliationPicker value={affiliation} onChange={setAffiliation} />

              <label style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                              textTransform: 'uppercase', letterSpacing: '0.7px',
                              marginBottom: '6px', display: 'block', marginTop: '16px' }}>X Handle</label>
              <input value={xHandle} onChange={e => setXHandle(e.target.value)}
                placeholder="@username"
                style={{ ...inputStyle, marginBottom: '4px' }} />
              <p style={{ fontSize: '11px', color: '#4a6280', marginBottom: '24px' }}>
                Get tagged when we post your issues
              </p>

              <button onClick={handleComplete} disabled={saving || !isAffiliationValid} style={{
                width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                backgroundColor: (isAffiliationValid && !saving) ? '#16a34a' : '#112035',
                color: (isAffiliationValid && !saving) ? '#ffffff' : '#4a6280',
                fontSize: '14px', fontWeight: '600',
                cursor: saving ? 'wait' : (isAffiliationValid ? 'pointer' : 'not-allowed'),
              }}>{saving ? 'Saving…' : 'Start Reporting'}</button>
              {!isAffiliationValid && (
                <p style={{ fontSize: '11px', color: '#4a6280', textAlign: 'center', marginTop: '8px' }}>
                  Select your {affiliation.role === 'student' ? 'college' : affiliation.role === 'employee' ? 'company' : 'role'} to continue
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
