import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WARD_REPRESENTATIVES,
  setRepresentatives,
  getRepresentativeForCity,
  getWardRepresentative,
  calculateScorecard,
} from '../../../src/constants/representatives';

// Store the original WARD_REPRESENTATIVES to reset ACTIVE after each test
let originalWardRepresentatives;

describe('representatives.js', () => {
  beforeEach(() => {
    // Deep copy WARD_REPRESENTATIVES to ensure it's truly reset for each test
    // as setRepresentatives modifies an internal `ACTIVE` variable.
    originalWardRepresentatives = JSON.parse(JSON.stringify(WARD_REPRESENTATIVES));
    setRepresentatives(originalWardRepresentatives); // Reset ACTIVE to default before each test
  });

  afterEach(() => {
    // Ensure ACTIVE is reset to the default after each test to prevent test pollution
    setRepresentatives(originalWardRepresentatives);
  });

  describe('WARD_REPRESENTATIVES', () => {
    it('should be an array', () => {
      expect(Array.isArray(WARD_REPRESENTATIVES)).toBe(true);
    });

    it('should contain representative objects with expected structure', () => {
      expect(WARD_REPRESENTATIVES.length).toBeGreaterThan(0);
      const firstWard = WARD_REPRESENTATIVES[0];
      expect(firstWard).toHaveProperty('wardNo');
      expect(firstWard).toHaveProperty('name');
      expect(firstWard).toHaveProperty('city');
      expect(firstWard).toHaveProperty('center');
      expect(firstWard.center).toHaveProperty('lat');
      expect(firstWard.center).toHaveProperty('lng');
      expect(firstWard).toHaveProperty('radiusKm');
      expect(firstWard).toHaveProperty('representative');
      expect(firstWard.representative).toHaveProperty('name');
      expect(firstWard.representative).toHaveProperty('party');
      expect(firstWard.representative).toHaveProperty('since');
      expect(firstWard.representative).toHaveProperty('phone');
    });

    it('should contain representatives for multiple cities', () => {
      const cities = new Set(WARD_REPRESENTATIVES.map(w => w.city));
      expect(cities.size).toBeGreaterThan(1);
      expect(cities).toContain('Bangalore');
      expect(cities).toContain('Mumbai');
      expect(cities).toContain('Delhi');
      expect(cities).toContain('Thane');
    });
  });

  describe('setRepresentatives', () => {
    it('should update the active representatives list with a valid array', () => {
      const newReps = [{ wardNo: 999, name: 'Test Ward', city: 'Test City', center: { lat: 0, lng: 0 }, radiusKm: 1, representative: { name: 'Test Rep', party: 'Test Party', since: '2024', phone: null } }];
      setRepresentatives(newReps);
      // Verify by calling a function that reads from ACTIVE
      const rep = getRepresentativeForCity('Test City');
      expect(rep).not.toBeNull();
      expect(rep.wardNo).toBe(999);
      expect(rep.representative.name).toBe('Test Rep');
    });

    it('should revert to WARD_REPRESENTATIVES if an empty array is provided', () => {
      setRepresentatives([]);
      const rep = getRepresentativeForCity('Bangalore'); // Should find Bangalore from fallback
      expect(rep).not.toBeNull();
      expect(rep.wardNo).toBe(45); // Koramangala is the first Bangalore ward in fallback
    });

    it('should revert to WARD_REPRESENTATIVES if null is provided', () => {
      setRepresentatives(null);
      const rep = getRepresentativeForCity('Bangalore');
      expect(rep).not.toBeNull();
      expect(rep.wardNo).toBe(45);
    });

    it('should revert to WARD_REPRESENTATIVES if undefined is provided', () => {
      setRepresentatives(undefined);
      const rep = getRepresentativeForCity('Bangalore');
      expect(rep).not.toBeNull();
      expect(rep.wardNo).toBe(45);
    });
  });

  describe('getRepresentativeForCity', () => {
    it('should return the representative for a known city (case-insensitive)', () => {
      const rep = getRepresentativeForCity('bangalore');
      expect(rep).not.toBeNull();
      expect(rep.city).toBe('Bangalore');
      expect(rep.wardNo).toBe(45); // First Bangalore ward
      expect(rep.wardName).toBe('Koramangala');
      expect(rep.representative.name).toBe('Ramesh Kumar');
    });

    it('should return null for an unknown city', () => {
      const rep = getRepresentativeForCity('Unknown City');
      expect(rep).toBeNull();
    });

    it('should return null for null city input', () => {
      const rep = getRepresentativeForCity(null);
      expect(rep).toBeNull();
    });

    it('should return null for undefined city input', () => {
      const rep = getRepresentativeForCity(undefined);
      expect(rep).toBeNull();
    });

    it('should return null for empty string city input', () => {
      const rep = getRepresentativeForCity('');
      expect(rep).toBeNull();
    });

    it('should use the currently active list of representatives', () => {
      const newReps = [{ wardNo: 1, name: 'New Ward', city: 'New City', center: { lat: 0, lng: 0 }, radiusKm: 1, representative: { name: 'New Rep', party: 'New Party', since: '2024', phone: null } }];
      setRepresentatives(newReps);
      // setRepresentatives MERGES claims over the built-in fallback (claims win by
      // ward), so the new ward is added on top of the fallback wards.
      const rep = getRepresentativeForCity('New City');
      expect(rep).not.toBeNull();
      expect(rep.city).toBe('New City');
      expect(rep.representative.name).toBe('New Rep');
      // Fallback Bangalore wards persist after a merge (they were not overridden),
      // so Koramangala (ward 45) is still resolvable.
      const oldRep = getRepresentativeForCity('Bangalore');
      expect(oldRep).not.toBeNull();
      expect(oldRep.wardNo).toBe(45);
      expect(oldRep.representative.name).toBe('Ramesh Kumar');
    });
  });

  describe('getWardRepresentative', () => {
    it('should return the correct ward representative for coordinates within Koramangala', () => {
      // Koramangala: center: { lat: 12.9352, lng: 77.6245 }, radiusKm: 1.5
      // Test point slightly off center but within radius
      const lat = 12.9360;
      const lng = 77.6250;
      const ward = getWardRepresentative(lat, lng);
      expect(ward).not.toBeNull();
      expect(ward.wardNo).toBe(45);
      expect(ward.wardName).toBe('Koramangala');
      expect(ward.city).toBe('Bangalore');
      expect(ward.representative.name).toBe('Ramesh Kumar');
    });

    it('should return the correct ward representative for coordinates within Indiranagar', () => {
      // Indiranagar: center: { lat: 12.9784, lng: 77.6408 }, radiusKm: 1.2
      const lat = 12.9780;
      const lng = 77.6400;
      const ward = getWardRepresentative(lat, lng);
      expect(ward).not.toBeNull();
      expect(ward.wardNo).toBe(12);
      expect(ward.wardName).toBe('Indiranagar');
      expect(ward.city).toBe('Bangalore');
      expect(ward.representative.name).toBe('Priya Nair');
    });

    it('should return null for coordinates outside any known ward', () => {
      // Coordinates far from any defined ward
      const lat = 0;
      const lng = 0;
      const ward = getWardRepresentative(lat, lng);
      expect(ward).toBeNull();
    });

    it('should return null for null lat/lng inputs', () => {
      expect(getWardRepresentative(null, 77.6)).toBeNull();
      expect(getWardRepresentative(12.9, null)).toBeNull();
      expect(getWardRepresentative(null, null)).toBeNull();
    });

    it('should return null for undefined lat/lng inputs', () => {
      expect(getWardRepresentative(undefined, 77.6)).toBeNull();
      expect(getWardRepresentative(12.9, undefined)).toBeNull();
      expect(getWardRepresentative(undefined, undefined)).toBeNull();
    });

    it('should return null for zero lat/lng inputs if not within a ward', () => {
      // Assuming (0,0) is not within any ward
      expect(getWardRepresentative(0, 0)).toBeNull();
    });

    it('should use the currently active list of representatives', () => {
      const newReps = [{ wardNo: 1, name: 'New Ward', city: 'New City', center: { lat: 0, lng: 0 }, radiusKm: 1, representative: { name: 'New Rep', party: 'New Party', since: '2024', phone: null } }];
      setRepresentatives(newReps);
      // The new ward is merged in, so a point inside its radius resolves to it.
      const ward = getWardRepresentative(0.001, 0.001); // Slightly off (0,0) but within radius 1
      expect(ward).not.toBeNull();
      expect(ward.wardNo).toBe(1);
      expect(ward.representative.name).toBe('New Rep');

      // setRepresentatives MERGES over the built-in fallback rather than replacing
      // it, so the original Koramangala ward is still active and a point inside its
      // radius still resolves to it.
      const oldWard = getWardRepresentative(12.9360, 77.6250);
      expect(oldWard).not.toBeNull();
      expect(oldWard.wardNo).toBe(45);
      expect(oldWard.representative.name).toBe('Ramesh Kumar');
    });

    it('should handle coordinates exactly on the radius boundary (or very close)', () => {
      // Koramangala: center: { lat: 12.9352, lng: 77.6245 }, radiusKm: 1.5
      // A point that is approximately 1.5km away from the center
      // A difference of 0.0135 degrees latitude is roughly 1.5km (0.0135 * 111 = 1.4985)
      const lat = 12.9352 + (1.49 / 111); // Just inside 1.5km radius
      const lng = 77.6245;
      const ward = getWardRepresentative(lat, lng);
      expect(ward).not.toBeNull();
      expect(ward.wardNo).toBe(45);
    });
  });

  describe('calculateScorecard', () => {
    // Mock Date.now() for consistent 'daysOpen' calculation
    const MOCK_DATE = new Date('2024-01-15T12:00:00.000Z');
    const REAL_DATE_NOW = Date.now;

    beforeEach(() => {
      global.Date.now = vi.fn(() => MOCK_DATE.getTime());
    });

    afterEach(() => {
      global.Date.now = REAL_DATE_NOW;
    });

    it('should return an empty array for an empty issues list', () => {
      const scorecard = calculateScorecard([]);
      expect(scorecard).toEqual([]);
    });

    it('should correctly calculate scorecard for a mix of issues', () => {
      const issues = [
        {
          id: '1',
          status: 'Resolved',
          severity: 'Low',
          createdAt: new Date('2024-01-01T12:00:00.000Z'), // 14 days open
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
        {
          id: '2',
          status: 'Open',
          severity: 'Critical',
          createdAt: { toDate: () => new Date('2024-01-05T12:00:00.000Z') }, // 10 days open
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
        {
          id: '3',
          status: 'Resolved',
          severity: 'Medium',
          createdAt: '2024-01-10T12:00:00.000Z', // 5 days open
          location: { lat: 12.9780, lng: 77.6400 }, // Indiranagar coordinates
        },
        {
          id: '4',
          status: 'Open',
          severity: 'Low',
          createdAt: new Date('2024-01-12T12:00:00.000Z'), // 3 days open
          location: { lat: 12.9780, lng: 77.6400 }, // Indiranagar coordinates
          wallOfShame: true,
        },
        {
          id: '5',
          status: 'Open',
          severity: 'Critical',
          createdAt: new Date('2024-01-14T12:00:00.000Z'), // 1 day open
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
        {
          id: '6', // Issue with no valid ward/location info
          status: 'Resolved',
          severity: 'Low',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          location: { lat: 0, lng: 0 }, // Outside any ward
        },
        {
          id: '7', // Issue with no representative info
          status: 'Resolved',
          severity: 'Low',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          wardInfo: { wardNo: 999, wardName: 'No Rep Ward', city: 'No Rep City', representative: null },
        },
      ];

      const scorecard = calculateScorecard(issues);

      expect(scorecard.length).toBe(2); // Ramesh Kumar (Koramangala) and Priya Nair (Indiranagar)

      // Expect sorting by resolutionRate (descending)
      expect(scorecard[0].representative.name).toBe('Priya Nair'); // 50% (1/2)
      expect(scorecard[1].representative.name).toBe('Ramesh Kumar'); // 33% (1/3)

      const rameshScore = scorecard.find(s => s.representative.name === 'Ramesh Kumar');
      expect(rameshScore).not.toBeNull();
      expect(rameshScore.totalIssues).toBe(3);
      expect(rameshScore.resolved).toBe(1);
      expect(rameshScore.resolutionRate).toBe(33); // (1/3) * 100 = 33.33 -> 33
      expect(rameshScore.criticalOpen).toBe(2); // Issue 2 and 5 are critical and open
      expect(rameshScore.wallOfShame).toBe(0);
      // Issue 1: 14 days, Issue 2: 10 days, Issue 5: 1 day. Total: 25 days. Avg: 25/3 = 8.33 -> 8
      expect(rameshScore.totalDaysOpen).toBe(25);
      expect(rameshScore.avgDays).toBe(8);

      const priyaScore = scorecard.find(s => s.representative.name === 'Priya Nair');
      expect(priyaScore).not.toBeNull();
      expect(priyaScore.totalIssues).toBe(2);
      expect(priyaScore.resolved).toBe(1);
      expect(priyaScore.resolutionRate).toBe(50); // (1/2) * 100 = 50
      expect(priyaScore.criticalOpen).toBe(0);
      expect(priyaScore.wallOfShame).toBe(1); // Issue 4
      // Issue 3: 5 days, Issue 4: 3 days. Total: 8 days. Avg: 8/2 = 4
      expect(priyaScore.totalDaysOpen).toBe(8);
      expect(priyaScore.avgDays).toBe(4);
    });

    it('should handle issues with no createdAt date gracefully', () => {
      const issues = [
        {
          id: '1',
          status: 'Resolved',
          severity: 'Low',
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
      ];
      const scorecard = calculateScorecard(issues);
      expect(scorecard.length).toBe(1);
      expect(scorecard[0].totalDaysOpen).toBe(0);
      expect(scorecard[0].avgDays).toBe(0);
    });

    it('should handle issues where totalIssues is zero for resolutionRate and avgDays', () => {
      const issues = [
        // This scenario shouldn't happen if issues are added, but if a rep has 0 issues,
        // their entry wouldn't be created. Let's simulate a rep with issues that don't count.
        {
          id: '1',
          status: 'Resolved',
          severity: 'Low',
          location: { lat: 0, lng: 0 }, // Outside any ward
        },
      ];
      const scorecard = calculateScorecard(issues);
      expect(scorecard).toEqual([]); // No valid issues, so no scorecard entries
    });

    it('should correctly calculate resolutionRate and avgDays when totalIssues > 0', () => {
      const issues = [
        {
          id: '1',
          status: 'Resolved',
          createdAt: new Date('2024-01-01T12:00:00.000Z'), // 14 days
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
        {
          id: '2',
          status: 'Open',
          createdAt: new Date('2024-01-08T12:00:00.000Z'), // 7 days
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
        },
      ];
      const scorecard = calculateScorecard(issues);
      expect(scorecard.length).toBe(1);
      expect(scorecard[0].totalIssues).toBe(2);
      expect(scorecard[0].resolved).toBe(1);
      expect(scorecard[0].resolutionRate).toBe(50); // (1/2) * 100
      expect(scorecard[0].totalDaysOpen).toBe(21); // 14 + 7
      expect(scorecard[0].avgDays).toBe(11); // 21/2 = 10.5 -> 11
    });

    it('should prioritize wardInfo over location for ward determination', () => {
      const issues = [
        {
          id: '1',
          status: 'Resolved',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          wardInfo: { wardNo: 999, wardName: 'Override Ward', city: 'Override City', representative: { name: 'Override Rep', party: 'OVP', since: '2024', phone: null } },
          location: { lat: 12.9360, lng: 77.6250 }, // Koramangala coordinates
        },
      ];
      const scorecard = calculateScorecard(issues);
      expect(scorecard.length).toBe(1);
      expect(scorecard[0].wardNo).toBe(999);
      expect(scorecard[0].representative.name).toBe('Override Rep');
    });

    it('should handle issues with missing representative data gracefully', () => {
      const issues = [
        {
          id: '1',
          status: 'Resolved',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          wardInfo: { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore', representative: null }, // Missing representative
        },
        {
          id: '2',
          status: 'Resolved',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          location: { lat: 0, lng: 0 }, // Location outside any ward, so no representative
        },
      ];
      const scorecard = calculateScorecard(issues);
      expect(scorecard).toEqual([]); // No issues should contribute to the scorecard
    });
  });
});