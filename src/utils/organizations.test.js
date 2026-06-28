import { describe, it, expect, vi } from 'vitest';

// Avoid initializing the real Firebase app when importing the module under test.
vi.mock('../firebase', () => ({ db: {} }));

import { findAdoptedOrg } from './organizations';

const ORGS = [
  { id: 'infosys', name: 'Infosys', type: 'company', zone: { lat: 12.8461, lng: 77.6726, radiusKm: 2 } },
  { id: 'rvce', name: 'RVCE', type: 'college', zone: { lat: 12.9237, lng: 77.4987, radiusKm: 1.5 } },
];

describe('findAdoptedOrg', () => {
  it('returns the org whose zone contains the point', () => {
    expect(findAdoptedOrg(ORGS, 12.8461, 77.6726)?.id).toBe('infosys');
  });
  it('matches a point just inside the radius', () => {
    // ~1 km north of Infosys (Δlat 0.009° ≈ 1 km) — within the 2 km radius.
    expect(findAdoptedOrg(ORGS, 12.8551, 77.6726)?.id).toBe('infosys');
  });
  it('returns null for a point outside every zone', () => {
    expect(findAdoptedOrg(ORGS, 19.0760, 72.8777)).toBeNull(); // Mumbai
  });
  it('returns null when lat/lng are missing', () => {
    expect(findAdoptedOrg(ORGS, undefined, undefined)).toBeNull();
  });
});
