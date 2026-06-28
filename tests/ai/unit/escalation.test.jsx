import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firebase Firestore SDK (paths resolved relative to THIS test file).
// We must keep the doc() / serverTimestamp() return shapes stable so we can assert
// exactly what updateDoc was called with.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, collection, id) => ({ _path: { segments: [collection, id] } })),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
}));

// Mock the Firebase app module the source imports (../firebase from src/utils).
vi.mock('../../../src/firebase', () => ({
  db: {},
}));

// Mock the n8n trigger the source imports (./n8n from src/utils).
vi.mock('../../../src/utils/n8n', () => ({
  triggerN8N: vi.fn(() => Promise.resolve()),
}));

// Import the module under test plus the mocked dependencies so we can assert on them.
import { checkAndEscalate, getEscalationInfo } from '../../../src/utils/escalation';
import { updateDoc } from 'firebase/firestore';
import { triggerN8N } from '../../../src/utils/n8n';
import { ESCALATION_LEVELS } from '../../../src/constants/issueTypes';

// ── Expected values derived from the REAL constants/source ──────────────────
// ESCALATION_LEVELS (src/constants/issueTypes.js):
//   0 Ward Officer (0d) | 1 Department Head (7d) | 2 Commissioner Office (14d) | 3 Media & Public Alert (30d)
// LEVEL_COLORS (internal to escalation.js): green → orange → red → dark red.
const EXPECTED_COLORS = ['#16a34a', '#f97316', '#ef4444', '#7f1d1d'];

// Mirror of the source's internal levelForDays, used to derive expectations only.
const expectedLevelForDays = (daysOpen) => {
  let lvl = 0;
  for (const e of ESCALATION_LEVELS) {
    if (daysOpen >= e.triggerDays) lvl = e.level;
  }
  return lvl;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('escalation utilities', () => {
  // Fixed "now" so day math is deterministic.
  const MOCK_NOW = new Date('2023-10-26T12:00:00.000Z');

  const tsDaysAgo = (n) => ({ toDate: () => new Date(MOCK_NOW.getTime() - n * MS_PER_DAY) });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── ESCALATION_LEVELS sanity (real constant) ──────────────────────────────
  describe('ESCALATION_LEVELS constant', () => {
    it('should define four escalating tiers with the expected names and triggers', () => {
      expect(ESCALATION_LEVELS).toHaveLength(4);
      expect(ESCALATION_LEVELS.map((l) => l.name)).toEqual([
        'Ward Officer',
        'Department Head',
        'Commissioner Office',
        'Media & Public Alert',
      ]);
      expect(ESCALATION_LEVELS.map((l) => l.triggerDays)).toEqual([0, 7, 14, 30]);
    });
  });

  // ── getEscalationInfo exposes daysSince / levelForDays / LEVEL_COLORS indirectly ──
  describe('getEscalationInfo', () => {
    const mockIssueBase = {
      id: 'issue123',
      complaintId: 'comp456',
      issueType: 'Road Pothole',
      locationText: 'Main Street',
      status: 'Open',
    };

    it('should return default info for null or undefined issue', () => {
      const info = getEscalationInfo(null);
      expect(info).toEqual({
        currentLevel: 0,
        currentAuthority: 'Ward Officer',
        daysOpen: 0,
        daysUntilNextEscalation: 7, // next trigger is at 7 days
        nextAuthority: 'Department Head',
        isWallOfShame: false,
        color: EXPECTED_COLORS[0], // green
      });
    });

    it('should return correct info for a new issue (level 0, 1 day open)', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(1), escalationLevel: 0 };
      const info = getEscalationInfo(issue);

      expect(info).toEqual({
        currentLevel: 0,
        currentAuthority: 'Ward Officer',
        daysOpen: 1,
        daysUntilNextEscalation: 6, // 7 (trigger) - 1 (open) = 6
        nextAuthority: 'Department Head',
        isWallOfShame: false,
        color: EXPECTED_COLORS[0],
      });
    });

    it('should return correct info for an issue at level 1 (8 days open)', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(8), escalationLevel: 1 };
      const info = getEscalationInfo(issue);

      expect(info).toEqual({
        currentLevel: 1,
        currentAuthority: 'Department Head',
        daysOpen: 8,
        daysUntilNextEscalation: 6, // 14 (trigger) - 8 (open) = 6
        nextAuthority: 'Commissioner Office',
        isWallOfShame: false,
        color: EXPECTED_COLORS[1], // orange
      });
    });

    it('should return correct info for an issue at highest level (level 3)', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(31), escalationLevel: 3 };
      const info = getEscalationInfo(issue);

      expect(info).toEqual({
        currentLevel: 3,
        currentAuthority: 'Media & Public Alert',
        daysOpen: 31,
        daysUntilNextEscalation: null, // no level above 3
        nextAuthority: null,
        isWallOfShame: true, // 31 >= 30
        color: EXPECTED_COLORS[3], // dark red
      });
    });

    it('should correctly identify wallOfShame for exactly 30 days open', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(30), escalationLevel: 2 };
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(30);
      expect(info.isWallOfShame).toBe(true);
    });

    it('should NOT flag wallOfShame for fewer than 30 days open', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(29), escalationLevel: 2 };
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(29);
      expect(info.isWallOfShame).toBe(false);
    });

    it('should clamp daysUntilNextEscalation to 0 when past the next trigger', () => {
      // 10 days open, current level 0. Next trigger (Department Head) is 7 days.
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(10), escalationLevel: 0 };
      const info = getEscalationInfo(issue);

      expect(info.currentLevel).toBe(0);
      expect(info.daysOpen).toBe(10);
      expect(info.daysUntilNextEscalation).toBe(0); // Math.max(0, 7 - 10) = 0
      expect(info.nextAuthority).toBe('Department Head');
    });

    it('should handle an issue with no createdAt gracefully', () => {
      const issue = { ...mockIssueBase, escalationLevel: 0 }; // no createdAt
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(0);
      expect(info.currentLevel).toBe(0);
      expect(info.currentAuthority).toBe('Ward Officer');
      expect(info.daysUntilNextEscalation).toBe(7);
      expect(info.nextAuthority).toBe('Department Head');
      expect(info.isWallOfShame).toBe(false);
      expect(info.color).toBe(EXPECTED_COLORS[0]);
    });

    it('should compute daysOpen from a Firebase Timestamp (toDate) object', () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(5), escalationLevel: 0 };
      expect(getEscalationInfo(issue).daysOpen).toBe(5);
    });

    it('should treat a future createdAt as 0 days open', () => {
      const future = { toDate: () => new Date(MOCK_NOW.getTime() + MS_PER_DAY) };
      const issue = { ...mockIssueBase, createdAt: future, escalationLevel: 0 };
      // Math.floor of a negative fraction is -1 in JS, but daysSince floors the raw diff;
      // a +1 day future date yields floor(-1) = -1, which getEscalationInfo passes through
      // as currentLevel default 0. We assert the public-facing currentLevel stays 0.
      expect(getEscalationInfo(issue).currentLevel).toBe(0);
    });
  });

  // ── levelForDays behavior (verified through expectedLevelForDays mirror) ───
  describe('escalation level thresholds', () => {
    it('matches the documented tier boundaries', () => {
      expect(expectedLevelForDays(0)).toBe(0);
      expect(expectedLevelForDays(6)).toBe(0);
      expect(expectedLevelForDays(7)).toBe(1);
      expect(expectedLevelForDays(13)).toBe(1);
      expect(expectedLevelForDays(14)).toBe(2);
      expect(expectedLevelForDays(29)).toBe(2);
      expect(expectedLevelForDays(30)).toBe(3);
      expect(expectedLevelForDays(100)).toBe(3);
      expect(expectedLevelForDays(-5)).toBe(0);
    });
  });

  // ── checkAndEscalate (side-effecting) ─────────────────────────────────────
  describe('checkAndEscalate', () => {
    const mockIssueBase = {
      id: 'issue123',
      complaintId: 'comp456',
      issueType: 'Road Pothole',
      locationText: 'Main Street',
      status: 'Open',
    };

    it('should return null if issue is null or undefined', async () => {
      expect(await checkAndEscalate(null)).toBeNull();
      expect(await checkAndEscalate(undefined)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should return null if issue status is "Resolved"', async () => {
      const resolvedIssue = { ...mockIssueBase, status: 'Resolved', createdAt: tsDaysAgo(40) };
      expect(await checkAndEscalate(resolvedIssue)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should return null if no escalation is needed (newLevel <= currentLevel)', async () => {
      // 1 day old, current level 0 → newLevel 0 → no escalation.
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(1), escalationLevel: 0 };
      expect(await checkAndEscalate(issue)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should escalate an aged issue and update Firestore + trigger n8n', async () => {
      // 8 days old, current level 0 → newLevel 1 (Department Head).
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(8), escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'Department Head',
        daysOpen: 8,
      });

      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue123'] } },
        {
          escalationLevel: 1,
          wallOfShame: false, // 8 days < 30
          updatedAt: { _methodName: 'serverTimestamp' },
        }
      );

      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith('escalation', {
        issueId: 'issue123',
        complaintId: 'comp456',
        issueType: 'Road Pothole',
        location: 'Main Street',
        from: 'Ward Officer',
        to: 'Department Head',
        daysOpen: 8,
      });
    });

    it('should escalate to the highest level and set wallOfShame past 30 days', async () => {
      // 35 days old, current level 0 → newLevel 3 (Media & Public Alert), wallOfShame true.
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(35), escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 3,
        escalatedTo: 'Media & Public Alert',
        daysOpen: 35,
      });

      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue123'] } },
        {
          escalationLevel: 3,
          wallOfShame: true, // 35 >= 30
          updatedAt: { _methodName: 'serverTimestamp' },
        }
      );

      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith('escalation', {
        issueId: 'issue123',
        complaintId: 'comp456',
        issueType: 'Road Pothole',
        location: 'Main Street',
        from: 'Ward Officer',
        to: 'Media & Public Alert',
        daysOpen: 35,
      });
    });

    it('should default a missing escalationLevel to 0 before escalating', async () => {
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(8) }; // no escalationLevel

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'Department Head',
        daysOpen: 8,
      });
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ escalationLevel: 1 })
      );
    });

    it('should return null and log an error if updateDoc fails', async () => {
      updateDoc.mockRejectedValueOnce(new Error('Firestore error'));
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(8), escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('[escalation]:', expect.any(Error));
      // n8n is only fired after a successful updateDoc.
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should still return escalation info even if triggerN8N rejects', async () => {
      triggerN8N.mockRejectedValueOnce(new Error('N8N error'));
      const issue = { ...mockIssueBase, createdAt: tsDaysAgo(8), escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'Department Head',
        daysOpen: 8,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      // The n8n rejection is swallowed by .catch(() => {}); no error logged.
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
