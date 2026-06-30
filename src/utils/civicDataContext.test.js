import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __coll: name })),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  query: vi.fn((...a) => ({ __query: a })),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
}));
// Deterministic distance: pull it from the issue itself so ordering is fully controlled.
vi.mock('./geo', () => ({
  distanceKm: vi.fn((lat1, lng1, lat2, lng2) => Math.abs(lat2 - lat1) + Math.abs(lng2 - lng1)),
}));
vi.mock('../constants/representatives', () => ({
  getWardRepresentative: vi.fn(() => null),
  getRepresentativeForCity: vi.fn(() => null),
  calculateScorecard: vi.fn(() => []),
}));

const docsOf = (rows) => ({ docs: rows.map((r) => ({ id: r.id || 'x', data: () => r })) });
const countOf = (n) => ({ data: () => ({ count: n }) });

// civicDataContext.js memoises raw Firestore reads in a module-level cache for 60s. To
// keep every test independent we reset the module registry and re-import a FRESH copy
// (empty cache) for each test, re-grabbing the mock handles from the re-evaluated graph.
const freshContext = async () => {
  vi.resetModules();
  const mod = await import('./civicDataContext');
  const fs = await import('firebase/firestore');
  const reps = await import('../constants/representatives');
  // sensible defaults; tests override as needed
  fs.getCountFromServer.mockResolvedValue(countOf(0));
  reps.getWardRepresentative.mockReturnValue(null);
  reps.getRepresentativeForCity.mockReturnValue(null);
  reps.calculateScorecard.mockReturnValue([]);
  return { fetchCivicContext: mod.fetchCivicContext, ...fs, ...reps };
};

beforeEach(() => vi.clearAllMocks());

describe('fetchCivicContext — aggregates', () => {
  it('counts totals, statuses, types, severities, resolution rate and citizen count', async () => {
    const { fetchCivicContext, getDocs, getCountFromServer } = await freshContext();
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Pothole', status: 'Resolved', severity: 'High', city: 'Bangalore', confirmations: 3 },
      { id: '2', issueType: 'Pothole', status: 'Reported', severity: 'Low', city: 'Bangalore', confirmations: 1 },
      { id: '3', issueType: 'Garbage', status: 'In Progress', severity: 'Medium', city: 'Mumbai', wallOfShame: true },
    ]));
    getCountFromServer.mockResolvedValue(countOf(42));

    const { context, stats } = await fetchCivicContext();

    expect(stats.total).toBe(3);
    expect(stats.resolvedCount).toBe(1);
    expect(stats.openCount).toBe(2);
    expect(stats.resolutionRate).toBe(33); // round(1/3*100)
    expect(stats.userCount).toBe(42);
    expect(stats.wallOfShameCount).toBe(1);

    expect(context).toContain('Total issues reported: 3');
    expect(context).toContain('Resolution rate: 33%');
    expect(context).toContain('Total citizens: 42');
    expect(context).toContain('Pothole: 2');
    expect(context).toContain('Garbage: 1');
    expect(context).toContain('MOST COMMON ISSUE: Pothole with 2 reports');
    // total confirmations across all = 4, avg round(4/3)=1
    expect(context).toContain('Total community confirmations: 4');
    expect(context).toContain('Average confirmations per issue: 1');
  });

  it('handles an empty database with a zeroed summary (no divide-by-zero)', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([]));
    const { context, stats } = await fetchCivicContext();
    expect(stats).toMatchObject({ total: 0, openCount: 0, resolvedCount: 0, resolutionRate: 0 });
    expect(context).toContain('Total issues reported: 0');
    expect(context).toContain('MOST COMMON ISSUE: N/A');
    expect(context).toContain('No critical issues currently open');
  });

  it('derives city from address text (more specific than the stored coarse city)', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([
      // stored city is the coarse "Mumbai", but the address text says Thane → bucket as Thane
      { id: '1', issueType: 'Pothole', status: 'Reported', city: 'Mumbai', locationText: 'Station Rd, Thane West, Thane' },
      { id: '2', issueType: 'Pothole', status: 'Reported', city: 'Mumbai', locationText: 'Linking Rd, Bandra, Mumbai' },
    ]));
    const { context } = await fetchCivicContext();
    expect(context).toContain('Thane: 1 total');
    expect(context).toContain('Mumbai: 1 total');
    // top locality picks the first address segment
    expect(context).toContain('Station Rd: 1');
    expect(context).toContain('Linking Rd: 1');
  });

  it('buckets a stored "Unknown" city as-is but a missing city as "Other"', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Pothole', status: 'Reported', city: 'Unknown' }, // kept as Unknown bucket
      { id: '2', issueType: 'Pothole', status: 'Reported' },                  // no city → Other bucket
    ]));
    const { context } = await fetchCivicContext();
    // deriveCity returns the stored 'Unknown' string verbatim, and 'Other' only when city is absent
    expect(context).toContain('Unknown: 1 total — 1 open, 0 resolved');
    expect(context).toContain('Other: 1 total — 1 open, 0 resolved');
  });

  it('lists current critical UNRESOLVED issues only', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Open Manhole', status: 'Reported', severity: 'Critical', locationText: 'MG Road, Bangalore', confirmations: 7 },
      { id: '2', issueType: 'Pothole', status: 'Resolved', severity: 'Critical', locationText: 'Old St' }, // resolved → excluded
    ]));
    const { context } = await fetchCivicContext();
    expect(context).toContain('Open Manhole at MG Road: 7 confirmations');
    expect(context).not.toContain('at Old St');
  });
});

describe('fetchCivicContext — ward representative + scorecard sections', () => {
  it('renders the scorecard ranked rows from calculateScorecard', async () => {
    const { fetchCivicContext, getDocs, calculateScorecard } = await freshContext();
    getDocs.mockResolvedValue(docsOf([{ id: '1', issueType: 'Pothole', status: 'Resolved' }]));
    calculateScorecard.mockReturnValue([
      { wardNo: 45, wardName: 'Koramangala', city: 'Bangalore',
        representative: { name: 'Ramesh Kumar', role: 'Elected Corporator' },
        totalIssues: 10, resolved: 8, resolutionRate: 80, avgDays: 4 },
    ]);
    const { context } = await fetchCivicContext();
    expect(context).toContain('Ramesh Kumar (Ward 45 Koramangala, Bangalore; Elected Corporator): 10 issues, 8 resolved, 80% resolution rate, avg 4 days');
  });

  it('shows the no-ward placeholder when the scorecard is empty', async () => {
    const { fetchCivicContext, getDocs, calculateScorecard } = await freshContext();
    getDocs.mockResolvedValue(docsOf([{ id: '1', issueType: 'Pothole', status: 'Reported' }]));
    calculateScorecard.mockReturnValue([]);
    const { context } = await fetchCivicContext();
    expect(context).toContain('No ward-mapped issues yet');
  });
});

describe('fetchCivicContext — NEAR YOU block', () => {
  const userLoc = { lat: 0, lng: 0, locationText: 'Indiranagar, Bangalore' };

  it('is absent when no userLocation is provided', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([{ id: '1', issueType: 'Pothole', status: 'Reported' }]));
    const { context } = await fetchCivicContext();
    expect(context).not.toContain('NEAR YOU');
  });

  it('reports "no issues nearby" when none fall within the radius', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Pothole', status: 'Reported', location: { lat: 50, lng: 50 } }, // ~100 "units" → > 3km
    ]));
    const { context } = await fetchCivicContext(userLoc);
    expect(context).toContain('NEAR YOU');
    expect(context).toContain('No issues reported within 3 km right now');
  });

  it('lists nearby issues ordered by ascending distance and counts open/resolved', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    // distanceKm mock = |dlat|+|dlng| from (0,0): far=2.0, near=0.5, mid=1.0 (all <= 3)
    getDocs.mockResolvedValue(docsOf([
      { id: 'far',  issueType: 'Garbage',  status: 'Reported', severity: 'Low',    location: { lat: 1.0, lng: 1.0 }, locationText: 'Far Rd, X' },
      { id: 'near', issueType: 'Pothole',  status: 'Resolved', severity: 'High',   location: { lat: 0.3, lng: 0.2 }, locationText: 'Near Rd, X' },
      { id: 'mid',  issueType: 'Pothole',  status: 'Reported', severity: 'Medium', location: { lat: 0.5, lng: 0.5 }, locationText: 'Mid Rd, X' },
    ]));
    const { context } = await fetchCivicContext(userLoc);

    expect(context).toContain('NEAR YOU');
    expect(context).toContain('Issues nearby: 3 (2 open, 1 resolved)');
    // closest list must be sorted nearest-first: Near (0.5) < Mid (1.0) < Far (2.0)
    const near = context.indexOf('Near Rd');
    const mid = context.indexOf('Mid Rd');
    const far = context.indexOf('Far Rd');
    expect(near).toBeGreaterThan(-1);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    // top types: Pothole (2), Garbage (1)
    expect(context).toContain('Pothole (2)');
  });

  it('appends the ward-representative line with its resolution record when one matches', async () => {
    const { fetchCivicContext, getDocs, getWardRepresentative, calculateScorecard } = await freshContext();
    getWardRepresentative.mockReturnValue({
      wardNo: 12, wardName: 'Indiranagar', city: 'Bangalore',
      representative: { name: 'Priya Nair', role: 'Resident Welfare Assoc.', since: '2023' },
    });
    calculateScorecard.mockReturnValue([
      { wardNo: 12, wardName: 'Indiranagar', city: 'Bangalore',
        representative: { name: 'Priya Nair', role: 'Resident Welfare Assoc.' },
        totalIssues: 5, resolved: 2, resolutionRate: 40, avgDays: 6, wallOfShame: 1 },
    ]);
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Pothole', status: 'Reported', location: { lat: 0.1, lng: 0.1 }, locationText: 'A Rd, X' },
    ]));

    const { context } = await fetchCivicContext(userLoc);
    expect(context).toContain('WARD REPRESENTATIVE (accountable for civic issues in your ward): Priya Nair, Ward 12 — Indiranagar, Bangalore');
    expect(context).toContain('Ward record: 5 issues received, 2 resolved (40% resolution rate), average 6 days to act, 1 ignored 30+ days');
  });

  it('falls back to the city-level representative when no exact ward matches', async () => {
    const { fetchCivicContext, getDocs, getWardRepresentative, getRepresentativeForCity } = await freshContext();
    getWardRepresentative.mockReturnValue(null);
    getRepresentativeForCity.mockReturnValue({
      wardNo: 45, wardName: 'Koramangala', city: 'Bangalore',
      representative: { name: 'Ramesh Kumar', role: 'Elected Corporator', since: '2023' },
    });
    getDocs.mockResolvedValue(docsOf([
      { id: '1', issueType: 'Pothole', status: 'Reported', location: { lat: 0.1, lng: 0.1 }, locationText: 'A Rd, X' },
    ]));
    const { context } = await fetchCivicContext(userLoc);
    expect(context).toContain('Ramesh Kumar, Ward 45 — Koramangala, Bangalore');
    // no scorecard row for this rep → "No civic issues recorded in this ward yet."
    expect(context).toContain('No civic issues recorded in this ward yet.');
  });
});

describe('fetchCivicContext — resilience', () => {
  it('returns the fallback context + zeroed stats when the issues read throws', async () => {
    const { fetchCivicContext, getDocs } = await freshContext();
    getDocs.mockRejectedValue(new Error('firestore down'));
    const { context, stats } = await fetchCivicContext();
    expect(context).toContain('Unable to fetch live data');
    expect(stats).toEqual({ total: 0, openCount: 0, resolvedCount: 0, resolutionRate: 0, userCount: 0, wallOfShameCount: 0 });
  });

  it('degrades gracefully (userCount 0) when only the citizen-count read fails', async () => {
    const { fetchCivicContext, getDocs, getCountFromServer } = await freshContext();
    getDocs.mockResolvedValue(docsOf([{ id: '1', issueType: 'Pothole', status: 'Reported' }]));
    getCountFromServer.mockRejectedValue(new Error('count denied'));
    const { context, stats } = await fetchCivicContext();
    expect(stats.userCount).toBe(0);
    expect(stats.total).toBe(1); // the rest still computes
    expect(context).toContain('Total citizens: 0');
  });
});
