import { useState, useEffect } from 'react';
import { Users, GraduationCap, Building2, MapPin, Plus, Check, Search } from 'lucide-react';
import { loadOrganizations } from '../utils/organizations';
import { distanceKm } from '../utils/geo';
import { forwardGeocode } from '../utils/geocode';
import { useSharedLocation } from './LocationProvider';
import { useToast } from './ToastProvider';
import LocationPicker from './LocationPicker';

const ROLES = [
  { key: 'civilian', label: 'Civilian', icon: Users },
  { key: 'student', label: 'Student', icon: GraduationCap },
  { key: 'employee', label: 'Employee', icon: Building2 },
];

const inputStyle = {
  width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
  border: '0.5px solid #1a2f4a', borderRadius: '10px',
  padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
};

// Reusable affiliation selector (role + college/company) shared by Onboarding and
// Profile. Controlled: `value` is { role, orgId, orgName, orgType, draft }, and
// `onChange` receives the next value. A manual "add new org" produces a `draft`
// ({name,type,zoneName,lat,lng}) that the parent persists via createOrganization().
export default function AffiliationPicker({ value, onChange }) {
  const toast = useToast();
  const { location } = useSharedLocation();
  const [allOrgs, setAllOrgs] = useState([]);
  const [query, setQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualPin, setManualPin] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | found | notfound

  useEffect(() => { loadOrganizations().then(setAllOrgs).catch(() => {}); }, []);

  const role = value?.role || 'civilian';
  const orgType = role === 'student' ? 'college' : 'company';
  const hasOrg = !!value?.orgId || !!value?.draft;

  const selectRole = (key) => {
    setManualMode(false);
    if (key === 'civilian') {
      onChange({ role: key, orgId: null, orgName: null, orgType: null, draft: null });
    } else {
      const nextType = key === 'student' ? 'college' : 'company';
      const keep = value?.orgType === nextType; // keep selection if the type still matches
      onChange({
        role: key, orgType: nextType,
        orgId: keep ? value.orgId : null,
        orgName: keep ? value.orgName : null,
        draft: keep ? value.draft : null,
      });
    }
  };

  const selectOrg = (org) => {
    onChange({ role, orgType: org.type, orgId: org.id, orgName: org.name, draft: null });
  };

  const clearOrg = () => {
    onChange({ role, orgType, orgId: null, orgName: null, draft: null });
    setManualMode(false);
  };

  const startManual = () => {
    setManualName(query.trim());
    setManualAddress('');
    setManualPin(null);
    setGeoStatus('idle');
    setManualMode(true);
  };

  const locate = async () => {
    setGeoStatus('locating');
    const pt = await forwardGeocode(manualAddress);
    if (pt) { setManualPin(pt); setGeoStatus('found'); }
    else { setGeoStatus('notfound'); toast.error('Address not found — try a more specific address.'); }
  };

  const confirmManual = () => {
    if (!manualName.trim()) { toast.error('Enter the organization name first.'); return; }
    if (!manualPin) { toast.error('Pick the organization location first.'); return; }
    onChange({
      role, orgType, orgId: null, orgName: manualName.trim(),
      draft: {
        name: manualName.trim(), type: orgType,
        zoneName: manualAddress.trim() || manualName.trim(),
        lat: manualPin.lat, lng: manualPin.lng,
      },
    });
    setManualMode(false);
  };

  // Type-filtered, nearest-first, then name-substring filtered.
  const candidates = allOrgs.filter(o => o.type === orgType);
  const sorted = location
    ? [...candidates].sort((a, b) =>
        distanceKm(location.lat, location.lng, a.zone?.lat, a.zone?.lng) -
        distanceKm(location.lat, location.lng, b.zone?.lat, b.zone?.lng))
    : candidates;
  const filtered = query
    ? sorted.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;
  const suggestions = filtered.slice(0, 6);

  return (
    <div>
      {/* Role */}
      <label style={labelStyle}>I am a</label>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {ROLES.map(r => {
          const Icon = r.icon;
          const active = role === r.key;
          return (
            <button key={r.key} type="button" onClick={() => selectRole(r.key)} style={{
              flex: 1, padding: '10px 6px', borderRadius: '10px', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600',
              backgroundColor: active ? '#00d4ff20' : 'transparent',
              color: active ? '#00d4ff' : '#94a3b8',
              border: active ? '1px solid #00d4ff' : '0.5px solid #1a2f4a',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            }}>
              <Icon size={18} strokeWidth={1.5} /> {r.label}
            </button>
          );
        })}
      </div>

      {/* Org selection (only for student/employee) */}
      {role !== 'civilian' && (
        <>
          <label style={labelStyle}>
            Your {orgType === 'college' ? 'college' : 'company'}
          </label>

          {hasOrg ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#112035', border: '0.5px solid #00d4ff40',
              borderRadius: '10px', padding: '10px 12px',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px',
                             fontSize: '14px', color: '#f0f6ff', fontWeight: '600' }}>
                <Check size={14} color="#16a34a" strokeWidth={2} />
                {value.orgName}{value.draft ? ' (new)' : ''}
              </span>
              <button type="button" onClick={clearOrg} style={{
                background: 'none', border: 'none', color: '#00d4ff',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}>Change</button>
            </div>
          ) : manualMode ? (
            <div style={{ backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
                          borderRadius: '12px', padding: '12px' }}>
              <input value={manualName} onChange={e => setManualName(e.target.value)}
                placeholder={orgType === 'college' ? 'College name' : 'Company name'}
                style={{ ...inputStyle, marginBottom: '8px' }} />
              <textarea value={manualAddress} onChange={e => { setManualAddress(e.target.value); setGeoStatus('idle'); }}
                placeholder="Address (used to locate it on the map)" rows={2}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: '8px' }} />
              <button type="button" onClick={locate} disabled={!manualAddress.trim() || geoStatus === 'locating'}
                style={{
                  width: '100%', padding: '9px', marginBottom: '8px',
                  backgroundColor: 'transparent', color: '#00d4ff',
                  border: '0.5px solid #00d4ff40', borderRadius: '10px',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                <MapPin size={14} strokeWidth={1.5} />
                {geoStatus === 'locating' ? 'Locating…' : 'Locate on map'}
              </button>
              {geoStatus === 'notfound' && (
                <p style={{ fontSize: '11px', color: '#f97316', marginBottom: '8px' }}>
                  Couldn’t find that address — drag the pin to set the location.
                </p>
              )}
              {(manualPin || geoStatus === 'notfound') && (
                <div style={{ marginBottom: '8px' }}>
                  <LocationPicker value={manualPin} onChange={(latlng) => setManualPin(latlng)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={confirmManual} disabled={!manualName.trim() || !manualPin}
                  style={{
                    flex: 1, padding: '9px', borderRadius: '10px', border: 'none',
                    backgroundColor: (manualName.trim() && manualPin) ? '#00d4ff' : '#112035',
                    color: (manualName.trim() && manualPin) ? '#04091a' : '#4a6280',
                    fontSize: '12px', fontWeight: '600',
                    cursor: (manualName.trim() && manualPin) ? 'pointer' : 'not-allowed',
                  }}>Save organization</button>
                <button type="button" onClick={() => setManualMode(false)} style={{
                  padding: '9px 14px', backgroundColor: 'transparent', color: '#94a3b8',
                  border: '0.5px solid #1a2f4a', borderRadius: '10px',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <Search size={14} color="#4a6280" strokeWidth={1.5} style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder={`Search ${orgType === 'college' ? 'colleges' : 'companies'}…`}
                  style={{ ...inputStyle, paddingLeft: '32px' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {suggestions.map(o => (
                  <button key={o.id} type="button" onClick={() => selectOrg(o)} style={{
                    padding: '7px 12px', borderRadius: '999px', cursor: 'pointer',
                    backgroundColor: '#112035', border: '0.5px solid #1a2f4a',
                    color: '#f0f6ff', fontSize: '12px', fontWeight: '500',
                  }}>
                    {o.name}
                    <span style={{ color: '#4a6280', marginLeft: '6px', fontSize: '10px' }}>
                      {o.zoneName?.split(',').slice(-1)[0]?.trim()}
                    </span>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <span style={{ fontSize: '12px', color: '#4a6280', padding: '4px 0' }}>
                    No match — add it manually below.
                  </span>
                )}
              </div>
              <button type="button" onClick={startManual} style={{
                background: 'none', border: 'none', color: '#00d4ff',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', padding: 0,
              }}>
                <Plus size={14} strokeWidth={1.5} /> Can’t find it? Add manually
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: '11px', fontWeight: '500', color: '#4a6280',
  textTransform: 'uppercase', letterSpacing: '0.7px',
  marginBottom: '6px', display: 'block',
};
