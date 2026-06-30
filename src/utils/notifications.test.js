import { describe, it, expect } from 'vitest';
import { buildNotifications } from './notifications';

const ME = 'me-uid';
const OTHER = 'other-uid';

const titles = (items) => items.map((i) => i.title);
const byKindCount = (items, kind) => items.filter((i) => i.kind === kind).length;

describe('buildNotifications — reporter (owner) side', () => {
  it('derives the existing reporter notifications unchanged', () => {
    const owned = [{
      id: 'o1', userId: ME, issueType: 'Pothole',
      updatedAt: '2026-06-20T10:00:00.000Z',
      confirmations: 5, escalationLevel: 1, xPosted: true,
      contributors: [{ userId: OTHER }],
      status: 'Needs Verification',
      statusHistory: [
        { status: 'Reported', changedBy: ME, changedAt: '2026-06-18T00:00:00.000Z' },
        { status: 'In Progress', changedBy: OTHER, changedAt: '2026-06-19T00:00:00.000Z', note: 'crew assigned' },
      ],
    }];
    const items = buildNotifications({ ownedIssues: owned, uid: ME });
    const t = titles(items);
    expect(t).toContain('Your Pothole report was marked In Progress');
    expect(t).toContain('Your Pothole reached 5 confirmations');
    expect(t).toContain('Your Pothole was escalated (level 1)');
    expect(t).toContain('Your Pothole was posted on @JanaShaktiApp');
    expect(t).toContain('1 citizen joined your Pothole report');
    expect(t).toContain('Your Pothole report needs community verification');
    // the initial "Reported" entry never becomes a notification
    expect(t.some((x) => /Reported/.test(x))).toBe(false);
  });

  it('returns [] without a uid', () => {
    expect(buildNotifications({ ownedIssues: [{ id: 'x', userId: ME }], uid: undefined })).toEqual([]);
  });
});

describe('buildNotifications — contributor side', () => {
  const joinedResolved = (over = {}) => ({
    id: 'c1', userId: OTHER, issueType: 'Streetlight',
    status: 'Resolved', contributedUids: [ME],
    resolvedAt: '2026-06-21T12:00:00.000Z', updatedAt: '2026-06-21T12:00:00.000Z',
    ...over,
  });

  it('notifies an active contributor to CLAIM +25 when a joined issue resolves', () => {
    const items = buildNotifications({ joinedIssues: [joinedResolved()], uid: ME });
    expect(byKindCount(items, 'reward')).toBe(1);
    expect(items.find((i) => i.kind === 'reward').title).toMatch(/claim \+25/i);
  });

  it('downgrades to a plain resolved notice once the reward is claimed', () => {
    const items = buildNotifications({ joinedIssues: [joinedResolved({ closeRewardedBy: [ME] })], uid: ME });
    expect(byKindCount(items, 'reward')).toBe(0);
    expect(byKindCount(items, 'resolved')).toBe(1);
    expect(items[0].title).not.toMatch(/claim/i);
  });

  it('does NOT reward a non-contributor (uid not in contributedUids)', () => {
    const items = buildNotifications({ joinedIssues: [joinedResolved({ contributedUids: [OTHER] })], uid: ME });
    expect(byKindCount(items, 'reward')).toBe(0);
    expect(byKindCount(items, 'resolved')).toBe(0);
  });

  it('notifies on status change by someone else (In Progress)', () => {
    const joined = [{
      id: 'c2', userId: OTHER, issueType: 'Garbage', status: 'In Progress',
      contributedUids: [ME], updatedAt: '2026-06-20T00:00:00.000Z',
      statusHistory: [{ status: 'In Progress', changedBy: OTHER, changedAt: '2026-06-20T00:00:00.000Z' }],
    }];
    const items = buildNotifications({ joinedIssues: joined, uid: ME });
    expect(items.find((i) => i.kind === 'status').title).toBe('A Garbage you joined is now In Progress');
  });

  it('prompts a verification vote when a joined issue Needs Verification', () => {
    const joined = [{ id: 'c3', userId: OTHER, issueType: 'Pothole', status: 'Needs Verification',
      contributedUids: [ME], updatedAt: '2026-06-20T00:00:00.000Z' }];
    const items = buildNotifications({ joinedIssues: joined, uid: ME });
    expect(byKindCount(items, 'vote')).toBe(1);
  });

  it('notifies on removal and suppresses other notices for that issue', () => {
    const joined = [{
      id: 'c4', userId: OTHER, issueType: 'Pothole', status: 'Needs Verification',
      contributedUids: [ME], removedUids: [ME], updatedAt: '2026-06-20T00:00:00.000Z',
    }];
    const items = buildNotifications({ joinedIssues: joined, uid: ME });
    expect(byKindCount(items, 'removed')).toBe(1);
    expect(byKindCount(items, 'vote')).toBe(0); // suppressed once removed
  });

  it('skips the contributor branch for the user’s OWN issue in the joined set', () => {
    const joined = [{ id: 'c5', userId: ME, issueType: 'Pothole', status: 'Resolved',
      contributedUids: [ME], resolvedAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z' }];
    const items = buildNotifications({ joinedIssues: joined, uid: ME });
    expect(byKindCount(items, 'reward')).toBe(0);
    expect(byKindCount(items, 'resolved')).toBe(0);
  });
});

describe('buildNotifications — activity by other contributors', () => {
  const joined = [{ id: 'a1', userId: OTHER, issueType: 'Water Leakage', status: 'In Progress', contributedUids: [ME], updatedAt: '2026-06-20T00:00:00.000Z' }];

  it('notifies on evidence/updates posted by OTHERS, not by self', () => {
    const activityEvents = [
      { id: 'e1', issueId: 'a1', issueType: 'Water Leakage', userId: OTHER, displayName: 'Asha', action: 'evidence_uploaded', message: 'photo of leak', createdAt: '2026-06-20T09:00:00.000Z' },
      { id: 'e2', issueId: 'a1', issueType: 'Water Leakage', userId: ME, action: 'update_posted', message: 'mine', createdAt: '2026-06-20T10:00:00.000Z' },
    ];
    const items = buildNotifications({ joinedIssues: joined, activityEvents, uid: ME });
    const acts = items.filter((i) => i.kind === 'activity');
    expect(acts).toHaveLength(1);
    expect(acts[0].title).toBe('Asha added evidence to a Water Leakage you joined');
  });

  it('caps activity at 2 newest per issue', () => {
    const activityEvents = [1, 2, 3, 4].map((n) => ({
      id: `e${n}`, issueId: 'a1', issueType: 'Water Leakage', userId: OTHER, displayName: 'X',
      action: 'update_posted', message: `u${n}`, createdAt: `2026-06-20T0${n}:00:00.000Z`,
    }));
    const items = buildNotifications({ joinedIssues: joined, activityEvents, uid: ME });
    expect(byKindCount(items, 'activity')).toBe(2);
  });
});

describe('buildNotifications — ordering & cap', () => {
  it('sorts newest-first and caps at 50', () => {
    const owned = Array.from({ length: 60 }, (_, n) => ({
      id: `o${n}`, userId: ME, issueType: 'Pothole', confirmations: 5,
      updatedAt: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(),
    }));
    const items = buildNotifications({ ownedIssues: owned, uid: ME });
    expect(items).toHaveLength(50);
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].time).getTime()).toBeGreaterThanOrEqual(new Date(items[i].time).getTime());
    }
  });
});
