import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotifications } from '../../../src/hooks/useNotifications';
import { useIssues } from '../../../src/hooks/useIssues'; // Import to mock

// Mock the useIssues hook to control the data it returns
vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: vi.fn(),
}));

// Helper to mock Firestore Timestamp objects
const mockTimestamp = (date) => ({
  toDate: () => date,
  toISOString: () => date.toISOString(),
});

describe('useNotifications', () => {
  const MOCK_UID = 'test-user-123';

  beforeEach(() => {
    // Reset the mock before each test to ensure isolation
    useIssues.mockReturnValue({ issues: [] });
  });

  // Test Case 1: Returns an empty array when no UID is provided
  it('should return an empty array when no uid is provided', () => {
    const { result } = renderHook(() => useNotifications(null));
    expect(result.current.items).toEqual([]);
  });

  // Test Case 2: Returns an empty array when UID is provided but no issues are found
  it('should return an empty array when uid is provided but no issues are found', () => {
    useIssues.mockReturnValue({ issues: [] }); // Mock useIssues to return no issues
    const { result } = renderHook(() => useNotifications(MOCK_UID));
    expect(result.current.items).toEqual([]);
  });

  // Test Case 3: Generates notifications for status changes made by others.
  // REAL BEHAVIOR: status-history items carry the raw `changedAt` value (the
  // Firestore Timestamp object) as `time` — the hook does NOT convert it to ISO.
  // Items where changedBy === uid, changedBy === 'seed', or status === 'Reported'
  // are skipped.
  // The mock returns the SAME issues for both useIssues calls (owned + joined) and
  // the issues carry no `userId`, so they are never treated as "owned" by the
  // contributor branch. That branch therefore also emits a `status` notification
  // (key `c-<id>-sh-1`) for the InProgress change made by `another-user`. Resolved /
  // Reported / Needs Verification status changes are excluded from the contributor
  // branch, so only the InProgress one is duplicated.
  it('should generate notifications for status changes made by users other than the reporter or "seed"', () => {
    const issueId = 'issue-status-change';
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const inProgressTs = mockTimestamp(yesterday);
    const resolvedTs = mockTimestamp(now);

    useIssues.mockReturnValue({
      issues: [
        {
          id: issueId,
          issueType: 'Bug',
          statusHistory: [
            { status: 'Reported', changedAt: mockTimestamp(twoDaysAgo), changedBy: MOCK_UID }, // skipped (reporter)
            { status: 'InProgress', changedAt: inProgressTs, changedBy: 'another-user' }, // notification
            { status: 'Resolved', changedAt: resolvedTs, changedBy: 'admin-user', note: 'Fixed it!' }, // resolved notification
            { status: 'Rejected', changedAt: mockTimestamp(new Date(now.getTime() + 1000)), changedBy: 'seed' }, // skipped (seed)
          ],
          updatedAt: mockTimestamp(now),
        },
      ],
    });

    const { result } = renderHook(() => useNotifications(MOCK_UID));

    // Two owner-side notifications (InProgress + Resolved) plus one contributor-side
    // notification for the same InProgress change (see comment above).
    expect(result.current.items).toHaveLength(3);

    const resolved = result.current.items.find((i) => i.kind === 'resolved');
    expect(resolved).toMatchObject({
      key: `${issueId}-sh-2`, // Index 2 in statusHistory
      issueId,
      kind: 'resolved',
      title: 'Your Bug report was resolved',
      note: 'Fixed it!',
      time: resolvedTs, // raw Timestamp object, unchanged
    });

    // Owner-side status notification for the InProgress change.
    const ownerStatus = result.current.items.find((i) => i.key === `${issueId}-sh-1`);
    expect(ownerStatus).toMatchObject({
      key: `${issueId}-sh-1`, // Index 1 in statusHistory
      issueId,
      kind: 'status',
      title: 'Your Bug report was marked InProgress',
      note: '',
      time: inProgressTs, // raw Timestamp object, unchanged
    });

    // Contributor-side status notification for the same InProgress change.
    const contributorStatus = result.current.items.find((i) => i.key === `c-${issueId}-sh-1`);
    expect(contributorStatus).toMatchObject({
      key: `c-${issueId}-sh-1`, // Index 1 in statusHistory, contributor branch
      issueId,
      kind: 'status',
      title: 'A Bug you joined is now InProgress',
      note: '',
      time: inProgressTs, // raw Timestamp object, unchanged
    });
  });

  // Test Case 4: Generates notifications for derived events (milestone, escalation, social).
  // REAL BEHAVIOR: derived events use toIso(updatedAt) -> ISO string for `time`.
  it('should generate notifications for derived events like milestones, escalations, and social posts', () => {
    const issueId = 'issue-derived-events';
    const updatedTime = new Date('2023-04-01T10:00:00Z');

    useIssues.mockReturnValue({
      issues: [
        {
          id: issueId,
          issueType: 'Feature Request',
          confirmations: 5, // Triggers milestone
          escalationLevel: 1, // Triggers escalation
          xPosted: true, // Triggers social post
          updatedAt: mockTimestamp(updatedTime),
          statusHistory: [], // focus on derived events
        },
      ],
    });

    const { result } = renderHook(() => useNotifications(MOCK_UID));

    expect(result.current.items).toHaveLength(3); // one of each derived event

    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        key: `${issueId}-conf`,
        issueId,
        kind: 'milestone',
        title: 'Your Feature Request reached 5 confirmations',
        note: 'The community is backing this issue.',
        time: updatedTime.toISOString(),
      })
    );

    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        key: `${issueId}-esc`,
        issueId,
        kind: 'escalation',
        title: 'Your Feature Request was escalated (level 1)',
        note: 'Raised to a higher authority.',
        time: updatedTime.toISOString(),
      })
    );

    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        key: `${issueId}-social`,
        issueId,
        kind: 'social',
        title: 'Your Feature Request was posted on @JanaShaktiApp',
        note: 'Amplified on social media.',
        time: updatedTime.toISOString(),
      })
    );
  });

  // Test Case 5: Filters out notifications without a valid time and keeps valid ones.
  // REAL BEHAVIOR: the filter keeps any truthy `time`. Status-history entries with
  // changedAt null/undefined are dropped. Derived events with updatedAt null are
  // dropped (toIso returns null). Derived events keep ISO-string times.
  it('should filter out notifications without valid time and keep the valid ones', () => {
    const issueId = 'issue-time-formats';
    const validDate = new Date('2023-03-15T14:30:00Z');
    const validIsoString = '2023-03-16T10:00:00Z';
    const validDateObject = new Date('2023-03-17T11:00:00Z');
    const validDateTs = mockTimestamp(validDate);

    useIssues.mockReturnValue({
      issues: [
        {
          id: issueId,
          issueType: 'Task',
          statusHistory: [
            { status: 'InProgress', changedAt: validDateTs, changedBy: 'other' }, // valid Timestamp
            { status: 'Resolved', changedAt: null, changedBy: 'admin' }, // filtered (no changedAt)
            { status: 'Rejected', changedAt: undefined, changedBy: 'another' }, // filtered (no changedAt)
          ],
          confirmations: 5,
          escalationLevel: 1,
          xPosted: true,
          updatedAt: validIsoString, // ISO string for derived events
        },
        {
          id: 'issue-invalid-updated',
          issueType: 'Problem',
          confirmations: 5,
          updatedAt: null, // filtered (toIso -> null)
        },
        {
          id: 'issue-date-object',
          issueType: 'Report',
          confirmations: 5,
          updatedAt: validDateObject, // Date object -> ISO string
        },
      ],
    });

    const { result } = renderHook(() => useNotifications(MOCK_UID));

    // Expected notifications (the mock returns the same issues for the owned + joined
    // useIssues calls, and the issues have no `userId`, so the contributor branch also
    // runs — see Test Case 3 comment):
    // 1. Owner status change from issue-time-formats (validDate, raw Timestamp object)
    // 2. Milestone from issue-time-formats (validIsoString)
    // 3. Escalation from issue-time-formats (validIsoString)
    // 4. Social from issue-time-formats (validIsoString)
    // 5. Milestone from issue-date-object (validDateObject -> ISO string)
    // 6. Contributor status change from issue-time-formats (validDate, raw Timestamp)
    // The null/undefined-changedAt status entries and the null-updatedAt milestone are
    // filtered out by the truthy-time filter.
    expect(result.current.items).toHaveLength(6);

    // Every kept item has a truthy time.
    result.current.items.forEach((item) => {
      expect(item.time).toBeTruthy();
    });

    // Owner-side status-history item keeps the raw Timestamp object as time.
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `${issueId}-sh-0`, time: validDateTs })
    );
    // Contributor-side status-history item keeps the same raw Timestamp object as time.
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `c-${issueId}-sh-0`, time: validDateTs })
    );
    // Derived events convert to ISO strings.
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `${issueId}-conf`, time: validIsoString })
    );
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `${issueId}-esc`, time: validIsoString })
    );
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `${issueId}-social`, time: validIsoString })
    );
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ key: `issue-date-object-conf`, time: validDateObject.toISOString() })
    );
  });

  // Test Case 6: Caps the number of notifications at 50.
  // Use ISO-string updatedAt so the sort (new Date(time)) is well-defined, and
  // derive one milestone notification per issue.
  it('should limit the number of notifications to a maximum of 50', () => {
    const manyIssues = [];
    const baseTime = new Date('2023-01-01T00:00:00Z').getTime();

    // 60 issues, each generating one milestone notification with a unique ISO time.
    for (let i = 0; i < 60; i++) {
      manyIssues.push({
        id: `issue-${i}`,
        issueType: 'Test',
        confirmations: 5,
        updatedAt: new Date(baseTime + i * 1000).toISOString(),
      });
    }

    useIssues.mockReturnValue({ issues: manyIssues });

    const { result } = renderHook(() => useNotifications(MOCK_UID));

    expect(result.current.items).toHaveLength(50); // capped at 50

    // Newest first; the 50 newest are kept (issues 10..59).
    expect(result.current.items[0].time).toBe(new Date(baseTime + 59 * 1000).toISOString());
    expect(result.current.items[49].time).toBe(new Date(baseTime + 10 * 1000).toISOString());
  });
});
