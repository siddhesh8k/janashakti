import { describe, it, expect, beforeEach } from 'vitest';
import { setRepresentatives, getWardRepresentative, aggregateByParty } from './representatives';

// Reset the module-level ACTIVE list to the built-in fallback before each test.
beforeEach(() => setRepresentatives([]));

describe('aggregateByParty', () => {
  it('rolls reps up to a neutral per-party rate and sorts by rate desc', () => {
    const scorecard = [
      { representative: { party: 'BJP' }, totalIssues: 10, resolved: 8, wallOfShame: 0 },
      { representative: { party: 'BJP' }, totalIssues: 10, resolved: 2, wallOfShame: 1 },
      { representative: { party: 'INC' }, totalIssues: 4,  resolved: 4, wallOfShame: 0 },
    ];
    const agg = aggregateByParty(scorecard);
    const bjp = agg.find((a) => a.party === 'BJP');
    const inc = agg.find((a) => a.party === 'INC');

    expect(bjp.reps).toBe(2);
    expect(bjp.totalIssues).toBe(20);
    expect(bjp.resolved).toBe(10);
    expect(bjp.resolutionRate).toBe(50); // 10/20
    expect(inc.resolutionRate).toBe(100); // 4/4
    expect(agg[0].party).toBe('INC'); // highest rate first
  });

  it('handles an empty scorecard', () => {
    expect(aggregateByParty([])).toEqual([]);
  });
});

describe('setRepresentatives merge-over-fallback', () => {
  // Koramangala — ward 45, Bangalore — is a built-in fallback ward (rep "Ramesh Kumar").
  const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

  it('overrides a fallback ward with a community claim, keeps other wards', () => {
    setRepresentatives([{
      wardNo: 45, name: 'Koramangala', city: 'Bangalore',
      center: KORAMANGALA, radiusKm: 1.5,
      representative: { name: 'Claimed Person', party: 'AAP', since: '2026', phone: null },
      selfDeclared: true, docId: 'bangalore-ward-45', flagCount: 2,
    }]);

    const claimed = getWardRepresentative(KORAMANGALA.lat, KORAMANGALA.lng);
    expect(claimed.representative.name).toBe('Claimed Person');
    expect(claimed.selfDeclared).toBe(true);
    expect(claimed.docId).toBe('bangalore-ward-45');
    expect(claimed.flagCount).toBe(2);

    // A different seeded ward (Indiranagar, ward 12) is still resolvable from the fallback.
    const other = getWardRepresentative(12.9784, 77.6408);
    expect(other?.representative?.name).toBeTruthy();
    expect(other.selfDeclared).toBe(false);
  });

  it('reverts to the built-in fallback when given an empty list', () => {
    setRepresentatives([]);
    const got = getWardRepresentative(KORAMANGALA.lat, KORAMANGALA.lng);
    expect(got.representative.name).toBe('Ramesh Kumar');
    expect(got.selfDeclared).toBe(false);
  });
});
