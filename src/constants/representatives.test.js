import { describe, it, expect, beforeEach } from 'vitest';
import { setRepresentatives, getWardRepresentative, aggregateByRole } from './representatives';

// Reset the module-level ACTIVE list to the built-in fallback before each test.
beforeEach(() => setRepresentatives([]));

describe('aggregateByRole', () => {
  it('rolls reps up to a neutral per-civic-role rate and sorts by rate desc', () => {
    const scorecard = [
      { representative: { role: 'Ward Volunteer' },   totalIssues: 10, resolved: 8, wallOfShame: 0 },
      { representative: { role: 'Ward Volunteer' },   totalIssues: 10, resolved: 2, wallOfShame: 1 },
      { representative: { role: 'Municipal Officer' }, totalIssues: 4,  resolved: 4, wallOfShame: 0 },
    ];
    const agg = aggregateByRole(scorecard);
    const vol = agg.find((a) => a.role === 'Ward Volunteer');
    const off = agg.find((a) => a.role === 'Municipal Officer');

    expect(vol.reps).toBe(2);
    expect(vol.totalIssues).toBe(20);
    expect(vol.resolved).toBe(10);
    expect(vol.resolutionRate).toBe(50); // 10/20
    expect(off.resolutionRate).toBe(100); // 4/4
    expect(agg[0].role).toBe('Municipal Officer'); // highest rate first
  });

  it('buckets a missing role under "Unspecified"', () => {
    const agg = aggregateByRole([{ representative: {}, totalIssues: 2, resolved: 1 }]);
    expect(agg[0].role).toBe('Unspecified');
  });

  it('handles an empty scorecard', () => {
    expect(aggregateByRole([])).toEqual([]);
  });
});

describe('setRepresentatives merge-over-fallback', () => {
  // Koramangala — ward 45, Bangalore — is a built-in fallback ward (rep "Ramesh Kumar").
  const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

  it('overrides a fallback ward with a community claim, keeps other wards', () => {
    setRepresentatives([{
      wardNo: 45, name: 'Koramangala', city: 'Bangalore',
      center: KORAMANGALA, radiusKm: 1.5,
      representative: { name: 'Claimed Person', role: 'Ward Volunteer', party: null, since: '2026', phone: null },
      selfDeclared: true, docId: 'bangalore-ward-45', flagCount: 2,
    }]);

    const claimed = getWardRepresentative(KORAMANGALA.lat, KORAMANGALA.lng);
    expect(claimed.representative.name).toBe('Claimed Person');
    expect(claimed.representative.role).toBe('Ward Volunteer');
    expect(claimed.selfDeclared).toBe(true);
    expect(claimed.docId).toBe('bangalore-ward-45');
    expect(claimed.flagCount).toBe(2);

    // A different seeded ward (Indiranagar, ward 12) is still resolvable from the fallback.
    const other = getWardRepresentative(12.9784, 77.6408);
    expect(other?.representative?.name).toBeTruthy();
    expect(other.selfDeclared).toBe(false);
  });

  it('reverts to the built-in fallback (role-based, no party) when given an empty list', () => {
    setRepresentatives([]);
    const got = getWardRepresentative(KORAMANGALA.lat, KORAMANGALA.lng);
    expect(got.representative.name).toBe('Ramesh Kumar');
    expect(got.representative.role).toBe('Elected Corporator');
    expect(got.representative.party).toBeNull();
  });
});
