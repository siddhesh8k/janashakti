import { describe, it, expect, vi } from 'vitest';
import {
  ISSUE_TYPES,
  SEVERITY_LEVELS,
  STATUS_PIPELINE,
  CIVIC_SCORE_POINTS,
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

    it('should contain at least 20 issue types', () => {
      expect(ISSUE_TYPES.length).toBeGreaterThanOrEqual(20);
    });

    it('should have objects with value, label, and color properties', () => {
      const sampleIssue = ISSUE_TYPES[0];
      expect(sampleIssue).toHaveProperty('value');
      expect(sampleIssue).toHaveProperty('label');
      expect(sampleIssue).toHaveProperty('color');
      expect(typeof sampleIssue.value).toBe('string');
      expect(typeof sampleIssue.label).toBe('string');
      expect(typeof sampleIssue.color).toBe('string');
    });

    it('should have unique values for each issue type', () => {
      const values = ISSUE_TYPES.map(issue => issue.value);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });

    it('should have specific known issue types', () => {
      const knownIssue = ISSUE_TYPES.find(issue => issue.value === 'Pothole');
      expect(knownIssue).toEqual({ value: 'Pothole', label: 'Pothole', color: '#f97316' });
      const otherIssue = ISSUE_TYPES.find(issue => issue.value === 'Other');
      expect(otherIssue).toEqual({ value: 'Other', label: 'Other', color: '#64748b' });
    });
  });

  describe('SEVERITY_LEVELS', () => {
    it('should be an array', () => {
      expect(Array.isArray(SEVERITY_LEVELS)).toBe(true);
    });

    it('should contain exactly four severity levels', () => {
      expect(SEVERITY_LEVELS).toHaveLength(4);
    });

    it('should contain the expected severity levels in order', () => {
      expect(SEVERITY_LEVELS).toEqual(['Low', 'Medium', 'High', 'Critical']);
    });
  });

  describe('STATUS_PIPELINE', () => {
    it('should be an array', () => {
      expect(Array.isArray(STATUS_PIPELINE)).toBe(true);
    });

    it('should contain exactly four status levels', () => {
      expect(STATUS_PIPELINE).toHaveLength(4);
    });

    it('should contain the expected status levels in order', () => {
      expect(STATUS_PIPELINE).toEqual(['Reported', 'Verified', 'In Progress', 'Resolved']);
    });
  });

  describe('CIVIC_SCORE_POINTS', () => {
    it('should be an object', () => {
      expect(typeof CIVIC_SCORE_POINTS).toBe('object');
      expect(CIVIC_SCORE_POINTS).not.toBeNull();
    });

    it('should contain specific score point values', () => {
      expect(CIVIC_SCORE_POINTS.REPORT_ISSUE).toBe(10);
      expect(CIVIC_SCORE_POINTS.VERIFY_ISSUE).toBe(5);
      expect(CIVIC_SCORE_POINTS.ISSUE_RESOLVED).toBe(25);
      expect(CIVIC_SCORE_POINTS.DAILY_STREAK).toBe(2);
    });

    it('should have all expected keys', () => {
      const expectedKeys = [
        'REPORT_ISSUE', 'VERIFY_ISSUE', 'SHARE_ISSUE',
        'RETWEET_POST', 'ISSUE_RESOLVED', 'DAILY_STREAK'
      ];
      expect(Object.keys(CIVIC_SCORE_POINTS)).toEqual(expect.arrayContaining(expectedKeys));
      expect(Object.keys(CIVIC_SCORE_POINTS).length).toBe(expectedKeys.length);
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
      const sampleLevel = LEVEL_THRESHOLDS[0];
      expect(sampleLevel).toHaveProperty('min');
      expect(sampleLevel).toHaveProperty('max');
      expect(sampleLevel).toHaveProperty('name');
      expect(sampleLevel).toHaveProperty('icon');
      expect(typeof sampleLevel.min).toBe('number');
      expect(typeof sampleLevel.max).toBe('number');
      expect(typeof sampleLevel.name).toBe('string');
      expect(typeof sampleLevel.icon).toBe('string');
    });

    it('should have the last level with max set to Infinity', () => {
      const lastLevel = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
      expect(lastLevel.max).toBe(Infinity);
      expect(lastLevel.name).toBe('City Guardian');
    });

    it('should have the first level starting at 0', () => {
      const firstLevel = LEVEL_THRESHOLDS[0];
      expect(firstLevel.min).toBe(0);
      expect(firstLevel.name).toBe('Newcomer');
    });
  });

  describe('levelFor', () => {
    it('should return "Newcomer" for a score of 0', () => {
      expect(levelFor(0)).toBe('Newcomer');
    });

    it('should return "Newcomer" for a score within the first tier (e.g., 25)', () => {
      expect(levelFor(25)).toBe('Newcomer');
    });

    it('should return "Reporter" for a score at the lower bound of Reporter (51)', () => {
      expect(levelFor(51)).toBe('Reporter');
    });

    it('should return "Reporter" for a score at the upper bound of Reporter (150)', () => {
      expect(levelFor(150)).toBe('Reporter');
    });

    it('should return "Guardian" for a score within the Guardian tier (e.g., 200)', () => {
      expect(levelFor(200)).toBe('Guardian');
    });

    it('should return "Local Hero" for a score at the lower bound of Local Hero (301)', () => {
      expect(levelFor(301)).toBe('Local Hero');
    });

    it('should return "City Guardian" for a score at the lower bound of City Guardian (501)', () => {
      expect(levelFor(501)).toBe('City Guardian');
    });

    it('should return "City Guardian" for a very high score (e.g., 10000)', () => {
      expect(levelFor(10000)).toBe('City Guardian');
    });

    it('should return "Newcomer" for undefined input', () => {
      expect(levelFor(undefined)).toBe('Newcomer');
    });

    it('should return "Newcomer" for null input', () => {
      expect(levelFor(null)).toBe('Newcomer');
    });

    it('should return "Newcomer" for negative scores', () => {
      expect(levelFor(-10)).toBe('Newcomer');
    });

    it('should return "Newcomer" for non-numeric input (defaults to 0)', () => {
      expect(levelFor('abc')).toBe('Newcomer');
      expect(levelFor({})).toBe('Newcomer');
    });
  });

  describe('BADGE_CONDITIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(BADGE_CONDITIONS)).toBe(true);
    });

    it('should contain at least 9 badge conditions', () => {
      expect(BADGE_CONDITIONS.length).toBeGreaterThanOrEqual(9);
    });

    it('should have objects with id, name, and condition properties', () => {
      const sampleBadge = BADGE_CONDITIONS[0];
      expect(sampleBadge).toHaveProperty('id');
      expect(sampleBadge).toHaveProperty('name');
      expect(sampleBadge).toHaveProperty('condition');
      expect(typeof sampleBadge.id).toBe('string');
      expect(typeof sampleBadge.name).toBe('string');
      expect(typeof sampleBadge.condition).toBe('function');
    });

    it('should correctly evaluate the "first_step" badge condition', () => {
      const firstStepBadge = BADGE_CONDITIONS.find(b => b.id === 'first_step');
      expect(firstStepBadge.condition({ issuesReported: 0 })).toBe(false);
      expect(firstStepBadge.condition({ issuesReported: 1 })).toBe(true);
      expect(firstStepBadge.condition({ issuesReported: 5 })).toBe(true);
    });

    it('should correctly evaluate the "community_star" badge condition', () => {
      const communityStarBadge = BADGE_CONDITIONS.find(b => b.id === 'community_star');
      expect(communityStarBadge.condition({ issuesResolved: 0 })).toBe(false);
      expect(communityStarBadge.condition({ issuesResolved: 1 })).toBe(true);
      expect(communityStarBadge.condition({ issuesResolved: 10 })).toBe(true);
    });

    it('should correctly evaluate the "city_champion" badge condition', () => {
      const cityChampionBadge = BADGE_CONDITIONS.find(b => b.id === 'city_champion');
      expect(cityChampionBadge.condition({ civicScore: 299 })).toBe(false);
      expect(cityChampionBadge.condition({ civicScore: 300 })).toBe(true);
      expect(cityChampionBadge.condition({ civicScore: 301 })).toBe(true);
    });
  });

  describe('ESCALATION_LEVELS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ESCALATION_LEVELS)).toBe(true);
    });

    it('should contain exactly four escalation levels', () => {
      expect(ESCALATION_LEVELS).toHaveLength(4);
    });

    it('should have objects with level, name, and triggerDays properties', () => {
      const sampleEscalation = ESCALATION_LEVELS[0];
      expect(sampleEscalation).toHaveProperty('level');
      expect(sampleEscalation).toHaveProperty('name');
      expect(sampleEscalation).toHaveProperty('triggerDays');
      expect(typeof sampleEscalation.level).toBe('number');
      expect(typeof sampleEscalation.name).toBe('string');
      expect(typeof sampleEscalation.triggerDays).toBe('number');
    });

    it('should have escalation levels in ascending order of triggerDays', () => {
      expect(ESCALATION_LEVELS[0].triggerDays).toBe(0);
      expect(ESCALATION_LEVELS[1].triggerDays).toBe(7);
      expect(ESCALATION_LEVELS[2].triggerDays).toBe(14);
      expect(ESCALATION_LEVELS[3].triggerDays).toBe(30);
    });

    it('should have specific known escalation levels', () => {
      expect(ESCALATION_LEVELS[0].name).toBe('Ward Officer');
      expect(ESCALATION_LEVELS[3].name).toBe('Media & Public Alert');
    });
  });

  describe('issueColorMap', () => {
    it('should be an object', () => {
      expect(typeof issueColorMap).toBe('object');
      expect(issueColorMap).not.toBeNull();
    });

    it('should contain keys for all issue types defined in ISSUE_TYPES', () => {
      const issueTypeValues = ISSUE_TYPES.map(issue => issue.value);
      const colorMapKeys = Object.keys(issueColorMap);
      expect(colorMapKeys.length).toBe(issueTypeValues.length);
      expect(colorMapKeys).toEqual(expect.arrayContaining(issueTypeValues));
    });

    it('should map issue values to their correct colors', () => {
      expect(issueColorMap.Pothole).toBe('#f97316');
      expect(issueColorMap['Water Leakage']).toBe('#3b82f6');
      expect(issueColorMap['Broken Streetlight']).toBe('#eab308');
      expect(issueColorMap.Other).toBe('#64748b');
    });

    it('should have string values for all colors', () => {
      Object.values(issueColorMap).forEach(color => {
        expect(typeof color).toBe('string');
        expect(color).toMatch(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/); // Basic hex color format check
      });
    });
  });
});