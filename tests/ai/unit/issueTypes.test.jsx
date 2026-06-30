import { describe, it, expect, vi } from 'vitest';
import {
  ISSUE_TYPES,
  SEVERITY_LEVELS,
  STATUS_PIPELINE,
  CIVIC_SCORE_POINTS,
  AUTHORITY_THRESHOLD,
  LEVEL_THRESHOLDS,
  levelFor,
  BADGE_CONDITIONS,
  ESCALATION_LEVELS,
  issueColorMap,
} from '../../../src/constants/issueTypes';

describe('issueTypes constants', () => {

  describe('ISSUE_TYPES', () => {
    it('should be an array', () => {
      expect(Array.isArray(ISSUE_TYPES)).toBe(true);
    });

    it('should contain at least 10 issue types', () => {
      expect(ISSUE_TYPES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have objects with value, label, and color properties', () => {
      ISSUE_TYPES.forEach(issue => {
        expect(issue).toHaveProperty('value');
        expect(typeof issue.value).toBe('string');
        expect(issue).toHaveProperty('label');
        expect(typeof issue.label).toBe('string');
        expect(issue).toHaveProperty('color');
        expect(typeof issue.color).toBe('string');
        expect(issue.color).toMatch(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/); // Basic hex color check
      });
    });

    it('should have unique "value" properties', () => {
      const values = ISSUE_TYPES.map(issue => issue.value);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });

    // Labels are intentionally NOT unique ('Broken Streetlight' maps to both the
    // 'Streetlight' and 'Broken Streetlight' values), so only values are asserted unique.

    it('should include "Pothole" and "Other" as issue types', () => {
      expect(ISSUE_TYPES.some(issue => issue.value === 'Pothole')).toBe(true);
      expect(ISSUE_TYPES.some(issue => issue.value === 'Other')).toBe(true);
    });
  });

  describe('SEVERITY_LEVELS', () => {
    it('should be an array', () => {
      expect(Array.isArray(SEVERITY_LEVELS)).toBe(true);
    });

    it('should contain exactly 4 severity levels', () => {
      expect(SEVERITY_LEVELS.length).toBe(4);
    });

    it('should contain "Low", "Medium", "High", and "Critical"', () => {
      expect(SEVERITY_LEVELS).toEqual(['Low', 'Medium', 'High', 'Critical']);
    });
  });

  describe('STATUS_PIPELINE', () => {
    it('should be an array', () => {
      expect(Array.isArray(STATUS_PIPELINE)).toBe(true);
    });

    it('should contain exactly 5 status levels', () => {
      expect(STATUS_PIPELINE.length).toBe(5);
    });

    it('should contain Reported, Verified, In Progress, Needs Verification, and Resolved', () => {
      expect(STATUS_PIPELINE).toEqual(['Reported', 'Verified', 'In Progress', 'Needs Verification', 'Resolved']);
    });
  });

  describe('CIVIC_SCORE_POINTS', () => {
    it('should be an object', () => {
      expect(typeof CIVIC_SCORE_POINTS).toBe('object');
      expect(CIVIC_SCORE_POINTS).not.toBeNull();
    });

    it('should define points for various actions', () => {
      expect(CIVIC_SCORE_POINTS).toHaveProperty('REPORT_ISSUE', 10);
      expect(CIVIC_SCORE_POINTS).toHaveProperty('VERIFY_ISSUE', 5);
      expect(CIVIC_SCORE_POINTS).toHaveProperty('ISSUE_RESOLVED', 25);
      expect(CIVIC_SCORE_POINTS).toHaveProperty('AUTHORITY_RESOLVE', 15);
    });

    it('reward values are positive and PENALTY_* values are negative', () => {
      for (const key in CIVIC_SCORE_POINTS) {
        expect(typeof CIVIC_SCORE_POINTS[key]).toBe('number');
        if (key.startsWith('PENALTY_')) {
          expect(CIVIC_SCORE_POINTS[key]).toBeLessThan(0);
        } else {
          expect(CIVIC_SCORE_POINTS[key]).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('AUTHORITY_THRESHOLD', () => {
    it('should be a number', () => {
      expect(typeof AUTHORITY_THRESHOLD).toBe('number');
    });

    it('should have the value 100', () => {
      expect(AUTHORITY_THRESHOLD).toBe(100);
    });
  });

  describe('LEVEL_THRESHOLDS', () => {
    it('should be an array', () => {
      expect(Array.isArray(LEVEL_THRESHOLDS)).toBe(true);
    });

    it('should contain at least 5 level thresholds', () => {
      expect(LEVEL_THRESHOLDS.length).toBeGreaterThanOrEqual(5);
    });

    it('should have objects with min, max, name, and icon properties', () => {
      LEVEL_THRESHOLDS.forEach(level => {
        expect(level).toHaveProperty('min');
        expect(typeof level.min).toBe('number');
        expect(level).toHaveProperty('max');
        expect(typeof level.max).toBe('number');
        expect(level).toHaveProperty('name');
        expect(typeof level.name).toBe('string');
        expect(level).toHaveProperty('icon');
        expect(typeof level.icon).toBe('string');
      });
    });

    it('should have the first level starting at 0', () => {
      expect(LEVEL_THRESHOLDS[0].min).toBe(0);
    });

    it('should have the last level ending at Infinity', () => {
      expect(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].max).toBe(Infinity);
    });

    it('should have consecutive min/max ranges', () => {
      for (let i = 0; i < LEVEL_THRESHOLDS.length - 1; i++) {
        expect(LEVEL_THRESHOLDS[i].max + 1).toBe(LEVEL_THRESHOLDS[i + 1].min);
      }
    });
  });

  describe('levelFor', () => {
    it('should return "Newcomer" for score 0', () => {
      expect(levelFor(0)).toBe('Newcomer');
    });

    it('should return "Newcomer" for scores within the first tier (e.g., 25, 50)', () => {
      expect(levelFor(25)).toBe('Newcomer');
      expect(levelFor(50)).toBe('Newcomer');
    });

    it('should return "Reporter" for scores within the second tier (e.g., 51, 100, 150)', () => {
      expect(levelFor(51)).toBe('Reporter');
      expect(levelFor(100)).toBe('Reporter');
      expect(levelFor(150)).toBe('Reporter');
    });

    it('should return "Guardian" for scores within the third tier (e.g., 151, 250, 300)', () => {
      expect(levelFor(151)).toBe('Guardian');
      expect(levelFor(250)).toBe('Guardian');
      expect(levelFor(300)).toBe('Guardian');
    });

    it('should return "Local Hero" for scores within the fourth tier (e.g., 301, 400, 500)', () => {
      expect(levelFor(301)).toBe('Local Hero');
      expect(levelFor(400)).toBe('Local Hero');
      expect(levelFor(500)).toBe('Local Hero');
    });

    it('should return "City Guardian" for scores within the highest tier (e.g., 501, 1000, Infinity)', () => {
      expect(levelFor(501)).toBe('City Guardian');
      expect(levelFor(1000)).toBe('City Guardian');
      expect(levelFor(Number.MAX_SAFE_INTEGER)).toBe('City Guardian');
    });

    it('should return "Newcomer" for undefined or null score (defaults to 0)', () => {
      expect(levelFor(undefined)).toBe('Newcomer');
      expect(levelFor(null)).toBe('Newcomer');
    });

    it('should return "Newcomer" for negative scores (defaults to 0)', () => {
      expect(levelFor(-10)).toBe('Newcomer');
    });
  });

  describe('BADGE_CONDITIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(BADGE_CONDITIONS)).toBe(true);
    });

    it('should contain at least 5 badge conditions', () => {
      expect(BADGE_CONDITIONS.length).toBeGreaterThanOrEqual(5);
    });

    it('should have objects with id, name, and condition properties', () => {
      BADGE_CONDITIONS.forEach(badge => {
        expect(badge).toHaveProperty('id');
        expect(typeof badge.id).toBe('string');
        expect(badge).toHaveProperty('name');
        expect(typeof badge.name).toBe('string');
        expect(badge).toHaveProperty('condition');
        expect(typeof badge.condition).toBe('function');
      });
    });

    describe('badge conditions logic', () => {
      it('should correctly evaluate "first_step" badge', () => {
        const firstStepBadge = BADGE_CONDITIONS.find(b => b.id === 'first_step');
        expect(firstStepBadge.condition({ issuesReported: 0 })).toBe(false);
        expect(firstStepBadge.condition({ issuesReported: 1 })).toBe(true);
        expect(firstStepBadge.condition({ issuesReported: 5 })).toBe(true);
      });

      it('should correctly evaluate "civic_authority" badge', () => {
        const civicAuthorityBadge = BADGE_CONDITIONS.find(b => b.id === 'civic_authority');
        expect(civicAuthorityBadge.condition({ civicScore: 0 })).toBe(false);
        expect(civicAuthorityBadge.condition({ civicScore: AUTHORITY_THRESHOLD - 1 })).toBe(false);
        expect(civicAuthorityBadge.condition({ civicScore: AUTHORITY_THRESHOLD })).toBe(true);
        expect(civicAuthorityBadge.condition({ civicScore: AUTHORITY_THRESHOLD + 10 })).toBe(true);
        expect(civicAuthorityBadge.condition({})).toBe(false); // Test with missing property
      });

      it('should correctly evaluate "community_star" badge', () => {
        const communityStarBadge = BADGE_CONDITIONS.find(b => b.id === 'community_star');
        expect(communityStarBadge.condition({ issuesResolved: 0 })).toBe(false);
        expect(communityStarBadge.condition({ issuesResolved: 1 })).toBe(true);
        expect(communityStarBadge.condition({ issuesResolved: 10 })).toBe(true);
      });

      it('should correctly evaluate "legend" badge', () => {
        const legendBadge = BADGE_CONDITIONS.find(b => b.id === 'legend');
        expect(legendBadge.condition({ civicScore: 499 })).toBe(false);
        expect(legendBadge.condition({ civicScore: 500 })).toBe(true);
        expect(legendBadge.condition({ civicScore: 501 })).toBe(true);
      });

      it('should correctly evaluate "social_voice" badge', () => {
        const socialVoiceBadge = BADGE_CONDITIONS.find(b => b.id === 'social_voice');
        expect(socialVoiceBadge.condition({ issuesShared: 2 })).toBe(false);
        expect(socialVoiceBadge.condition({ issuesShared: 3 })).toBe(true);
        expect(socialVoiceBadge.condition({ issuesShared: 5 })).toBe(true);
      });
    });
  });

  describe('ESCALATION_LEVELS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ESCALATION_LEVELS)).toBe(true);
    });

    it('should contain exactly 4 escalation levels', () => {
      expect(ESCALATION_LEVELS.length).toBe(4);
    });

    it('should have objects with level, name, and triggerDays properties', () => {
      ESCALATION_LEVELS.forEach(escalation => {
        expect(escalation).toHaveProperty('level');
        expect(typeof escalation.level).toBe('number');
        expect(escalation).toHaveProperty('name');
        expect(typeof escalation.name).toBe('string');
        expect(escalation).toHaveProperty('triggerDays');
        expect(typeof escalation.triggerDays).toBe('number');
      });
    });

    it('should have increasing triggerDays', () => {
      for (let i = 0; i < ESCALATION_LEVELS.length - 1; i++) {
        expect(ESCALATION_LEVELS[i].triggerDays).toBeLessThan(ESCALATION_LEVELS[i + 1].triggerDays);
      }
    });

    it('should have the first level with triggerDays 0', () => {
      expect(ESCALATION_LEVELS[0].triggerDays).toBe(0);
    });
  });

  describe('issueColorMap', () => {
    it('should be an object', () => {
      expect(typeof issueColorMap).toBe('object');
      expect(issueColorMap).not.toBeNull();
    });

    it('should have a color for every issue type defined in ISSUE_TYPES', () => {
      ISSUE_TYPES.forEach(issue => {
        expect(issueColorMap).toHaveProperty(issue.value);
        expect(issueColorMap[issue.value]).toBe(issue.color);
      });
    });

    it('should only contain keys that are issue types from ISSUE_TYPES', () => {
      const issueTypeValues = new Set(ISSUE_TYPES.map(issue => issue.value));
      for (const key in issueColorMap) {
        expect(issueTypeValues.has(key)).toBe(true);
      }
    });

    it('should map "Pothole" to its correct color', () => {
      expect(issueColorMap.Pothole).toBe('#f97316');
    });

    it('should map "Traffic Signal Malfunction" to its correct color', () => {
      expect(issueColorMap['Traffic Signal Malfunction']).toBe('#f43f5e');
    });

    it('should map "Other" to its correct color', () => {
      expect(issueColorMap.Other).toBe('#64748b');
    });
  });
});