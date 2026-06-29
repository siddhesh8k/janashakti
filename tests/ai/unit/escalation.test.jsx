import { describe, it, expect, vi } from 'vitest';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { triggerN8N } from '../../../src/utils/n8n';
import { ESCALATION_LEVELS } from '../../../src/constants/issueTypes';

// Mock external dependencies
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ _path: { segments: [collection, id] } })), // Simplified mock doc ref
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ _is  : 'serverTimestamp' })), // Mock serverTimestamp
}));

vi.mock('../../../src/firebase', () => ({
  db: {}, // Mock db object
}));

vi.mock('../../../src/utils/n8n', () => ({
  triggerN8N: vi.fn(() => Promise.resolve()),
}));

// Mock ESCALATION_LEVELS for consistent testing.
// vi.hoisted() so it's initialized before the hoisted vi.mock() factory reads it.
const MOCK_ESCALATION_LEVELS = vi.hoisted(() => [
  { level: 0, name: 'Ward Officer', triggerDays: 0 },
  { level: 1, name: 'District Head', triggerDays: 5 },
  { level: 2, name: 'Regional Director', triggerDays: 10 },
  { level: 3, name: 'Media Contact', triggerDays: 20 },
]);

vi.mock('../../../src/constants/issueTypes', () => ({
  ESCALATION_LEVELS: MOCK_ESCALATION_LEVELS,
}));

// Import the module after mocks are set up
import { checkAndEscalate, getEscalationInfo } from '../../../src/utils/escalation';

describe('escalation utilities', () => {
  const REAL_DATE_NOW = Date.now;
  const MOCK_NOW = new Date('2023-10-26T12:00:00.000Z').getTime(); // Consistent mock time

  beforeAll(() => {
    // Mock Date.now() for consistent daysSince calculations
    global.Date.now = vi.fn(() => MOCK_NOW);
  });

  afterAll(() => {
    global.Date.now = REAL_DATE_NOW; // Restore original Date.now()
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndEscalate', () => {
    it('should return null if issue is null or undefined', async () => {
      expect(await checkAndEscalate(null)).toBeNull();
      expect(await checkAndEscalate(undefined)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should return null if issue status is "Resolved"', async () => {
      const issue = { id: '123', status: 'Resolved', createdAt: new Date() };
      expect(await checkAndEscalate(issue)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should return null if newLevel is not higher than currentLevel', async () => {
      // Issue created 2 days ago, current level 0. New level should still be 0.
      const createdAt = new Date(MOCK_NOW - 2 * 24 * 60 * 60 * 1000);
      const issue = { id: '123', status: 'Open', createdAt, escalationLevel: 0 };
      expect(await checkAndEscalate(issue)).toBeNull();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(triggerN8N).not.toHaveBeenCalled();
    });

    it('should escalate from level 0 to level 1 (5 days open)', async () => {
      // Issue created 6 days ago (qualifies for level 1)
      const createdAt = new Date(MOCK_NOW - 6 * 24 * 60 * 60 * 1000);
      const issue = {
        id: 'issue-001',
        status: 'Open',
        createdAt,
        escalationLevel: 0,
        issueType: 'Bug',
        severity: 'High',
        locationText: 'Main Office',
        complaintId: 'comp-001',
        confirmations: 2,
      };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'District Head',
        daysOpen: 6,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue-001'] } },
        {
          escalationLevel: 1,
          wallOfShame: false, // 6 days < 30 days
          updatedAt: { _is: 'serverTimestamp' },
        }
      );
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith(
        'escalation',
        expect.objectContaining({
          issueId: 'issue-001',
          complaintId: 'comp-001',
          issueType: 'Bug',
          severity: 'High',
          location: 'Main Office',
          escalationLevel: 1,
          previousLevel: 'Ward Officer',
          escalatedTo: 'District Head',
          confirmations: 2,
          daysOpen: 6,
          from: 'Ward Officer',
          to: 'District Head',
        })
      );
    });

    it('should escalate from level 1 to level 2 (10 days open)', async () => {
      // Issue created 11 days ago (qualifies for level 2)
      const createdAt = new Date(MOCK_NOW - 11 * 24 * 60 * 60 * 1000);
      const issue = {
        id: 'issue-002',
        status: 'Open',
        createdAt,
        escalationLevel: 1,
        issueType: 'Feature',
        severity: 'Medium',
        locationText: 'Branch Office',
      };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 1,
        to: 2,
        escalatedTo: 'Regional Director',
        daysOpen: 11,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue-002'] } },
        {
          escalationLevel: 2,
          wallOfShame: false, // 11 days < 30 days
          updatedAt: { _is: 'serverTimestamp' },
        }
      );
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith(
        'escalation',
        expect.objectContaining({
          issueId: 'issue-002',
          escalationLevel: 2,
          previousLevel: 'District Head',
          escalatedTo: 'Regional Director',
          daysOpen: 11,
        })
      );
    });

    it('should escalate directly to level 3 and set wallOfShame (30+ days open)', async () => {
      // Issue created 35 days ago (qualifies for level 3 and wallOfShame)
      const createdAt = new Date(MOCK_NOW - 35 * 24 * 60 * 60 * 1000);
      const issue = {
        id: 'issue-003',
        status: 'Open',
        createdAt,
        escalationLevel: 0,
        issueType: 'Security',
        severity: 'Critical',
        locationText: 'Data Center',
      };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 3,
        escalatedTo: 'Media Contact',
        daysOpen: 35,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue-003'] } },
        {
          escalationLevel: 3,
          wallOfShame: true, // 35 days >= 30 days
          updatedAt: { _is: 'serverTimestamp' },
        }
      );
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith(
        'escalation',
        expect.objectContaining({
          issueId: 'issue-003',
          escalationLevel: 3,
          previousLevel: 'Ward Officer',
          escalatedTo: 'Media Contact',
          daysOpen: 35,
        })
      );
    });

    it('should handle issues with no initial escalationLevel (defaults to 0)', async () => {
      // Issue created 6 days ago, no escalationLevel set
      const createdAt = new Date(MOCK_NOW - 6 * 24 * 60 * 60 * 1000);
      const issue = {
        id: 'issue-004',
        status: 'Open',
        createdAt,
        issueType: 'UI Bug',
        severity: 'Low',
        locationText: 'Website',
      };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'District Head',
        daysOpen: 6,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(
        { _path: { segments: ['issues', 'issue-004'] } },
        expect.objectContaining({
          escalationLevel: 1,
        })
      );
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledWith(
        'escalation',
        expect.objectContaining({
          issueId: 'issue-004',
          escalationLevel: 1,
          previousLevel: 'Ward Officer',
        })
      );
    });

    it('should return null and log error if updateDoc fails', async () => {
      const errorMessage = 'Firestore update failed';
      updateDoc.mockRejectedValueOnce(new Error(errorMessage));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const createdAt = new Date(MOCK_NOW - 6 * 24 * 60 * 60 * 1000);
      const issue = { id: 'issue-005', status: 'Open', createdAt, escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toBeNull();
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(triggerN8N).not.toHaveBeenCalled(); // N8N should not be triggered if updateDoc fails
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[escalation]:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should not fail if triggerN8N fails (it catches its own errors)', async () => {
      triggerN8N.mockImplementationOnce(() => Promise.reject(new Error('N8N failed'))); // This should be caught internally by triggerN8N

      const createdAt = new Date(MOCK_NOW - 6 * 24 * 60 * 60 * 1000);
      const issue = { id: 'issue-006', status: 'Open', createdAt, escalationLevel: 0 };

      const result = await checkAndEscalate(issue);

      expect(result).toEqual({
        escalated: true,
        from: 0,
        to: 1,
        escalatedTo: 'District Head',
        daysOpen: 6,
      });
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(triggerN8N).toHaveBeenCalledTimes(1);
      // No console.error from checkAndEscalate itself for triggerN8N failure
    });
  });

  describe('getEscalationInfo', () => {
    it('should return default info for null or undefined issue', () => {
      const expectedDefault = {
        currentLevel: 0,
        currentAuthority: 'Ward Officer',
        daysOpen: 0,
        daysUntilNextEscalation: MOCK_ESCALATION_LEVELS[1].triggerDays, // 5 days
        nextAuthority: 'District Head',
        isWallOfShame: false,
        color: '#16a34a', // LEVEL_COLORS[0]
      };

      expect(getEscalationInfo(null)).toEqual(expectedDefault);
      expect(getEscalationInfo(undefined)).toEqual(expectedDefault);
    });

    it('should return correct info for a new issue (level 0, 0 days open)', () => {
      const issue = { createdAt: new Date(MOCK_NOW) }; // Created right now
      const info = getEscalationInfo(issue);
      expect(info).toEqual({
        currentLevel: 0,
        currentAuthority: 'Ward Officer',
        daysOpen: 0,
        daysUntilNextEscalation: 5,
        nextAuthority: 'District Head',
        isWallOfShame: false,
        color: '#16a34a',
      });
    });

    it('should return correct info for an issue at level 0, 2 days open', () => {
      const createdAt = new Date(MOCK_NOW - 2 * 24 * 60 * 60 * 1000);
      const issue = { createdAt, escalationLevel: 0 };
      const info = getEscalationInfo(issue);
      expect(info).toEqual({
        currentLevel: 0,
        currentAuthority: 'Ward Officer',
        daysOpen: 2,
        daysUntilNextEscalation: 3, // 5 - 2
        nextAuthority: 'District Head',
        isWallOfShame: false,
        color: '#16a34a',
      });
    });

    it('should return correct info for an issue at level 1, 6 days open', () => {
      const createdAt = new Date(MOCK_NOW - 6 * 24 * 60 * 60 * 1000);
      const issue = { createdAt, escalationLevel: 1 };
      const info = getEscalationInfo(issue);
      expect(info).toEqual({
        currentLevel: 1,
        currentAuthority: 'District Head',
        daysOpen: 6,
        daysUntilNextEscalation: 4, // 10 - 6
        nextAuthority: 'Regional Director',
        isWallOfShame: false,
        color: '#f97316', // LEVEL_COLORS[1]
      });
    });

    it('should return correct info for an issue at the highest level (level 3, 25 days open)', () => {
      const createdAt = new Date(MOCK_NOW - 25 * 24 * 60 * 60 * 1000);
      const issue = { createdAt, escalationLevel: 3 };
      const info = getEscalationInfo(issue);
      expect(info).toEqual({
        currentLevel: 3,
        currentAuthority: 'Media Contact',
        daysOpen: 25,
        daysUntilNextEscalation: null, // No next level
        nextAuthority: null,
        isWallOfShame: false,
        color: '#7f1d1d', // LEVEL_COLORS[3]
      });
    });

    it('should correctly identify wallOfShame for 30 days open', () => {
      const createdAt = new Date(MOCK_NOW - 30 * 24 * 60 * 60 * 1000);
      const issue = { createdAt, escalationLevel: 2 };
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(30);
      expect(info.isWallOfShame).toBe(true);
      expect(info.currentLevel).toBe(2);
      expect(info.currentAuthority).toBe('Regional Director');
      expect(info.color).toBe('#ef4444'); // LEVEL_COLORS[2]
    });

    it('should correctly identify wallOfShame for more than 30 days open', () => {
      const createdAt = new Date(MOCK_NOW - 31 * 24 * 60 * 60 * 1000);
      const issue = { createdAt, escalationLevel: 3 };
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(31);
      expect(info.isWallOfShame).toBe(true);
    });

    it('should handle createdAt as a Firestore Timestamp object', () => {
      const mockTimestamp = {
        toDate: () => new Date(MOCK_NOW - 7 * 24 * 60 * 60 * 1000),
      };
      const issue = { createdAt: mockTimestamp, escalationLevel: 1 };
      const info = getEscalationInfo(issue);
      expect(info.daysOpen).toBe(7);
      expect(info.currentLevel).toBe(1);
    });
  });
});