import { describe, it, expect } from 'vitest';
import { generateComplaintId } from '../../src/utils/complaintId';
import { getShareLinks, shouldAutoPost } from '../../src/utils/social';
import { severityStyle, statusColor } from '../../src/theme/components';
import { ISSUE_TYPES, SEVERITY_LEVELS, STATUS_PIPELINE,
         CIVIC_SCORE_POINTS, LEVEL_THRESHOLDS, BADGE_CONDITIONS } from '../../src/constants/issueTypes';
import { DEPARTMENT_MAP } from '../../src/constants/departments';

describe('Complaint ID Generator', () => {
  it('generates ID in correct format JS-XXX-YYYY-NNNNN', () => {
    const id = generateComplaintId('Bangalore');
    expect(id).toMatch(/^JS-BLR-\d{4}-\d{5}$/);
  });

  it('uses correct city codes', () => {
    expect(generateComplaintId('Mumbai')).toContain('MUM');
    expect(generateComplaintId('Delhi')).toContain('DEL');
    expect(generateComplaintId('Chennai')).toContain('CHN');
    expect(generateComplaintId('Other')).toContain('OTH');
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateComplaintId('Bangalore')));
    expect(ids.size).toBeGreaterThan(15); // at least 75% unique
  });

  it('derives a 3-letter code for an unmapped city', () => {
    // Unmapped cities fall back to the first 3 letters of the name (not "OTH").
    expect(generateComplaintId('Timbuktu')).toMatch(/^JS-TIM-\d{4}-\d{5}$/);
  });

  it('handles no city argument (defaults to OTH)', () => {
    expect(generateComplaintId()).toMatch(/^JS-OTH-\d{4}-\d{5}$/);
  });
});

describe('Social Utils', () => {
  const mockIssue = {
    id: 'test-123',
    issueType: 'Pothole',
    locationText: 'MG Road, Bangalore',
    confirmations: 3,
    severity: 'High',
    socialConsent: 'anonymous',
  };

  it('generates share links with correct URLs', () => {
    const links = getShareLinks(mockIssue, null);
    expect(links.whatsapp).toContain('wa.me');
    expect(links.xShare).toContain('twitter.com/intent');
    expect(links.linkedin).toContain('linkedin.com/sharing');
  });

  it('auto-posts once confirmations reach the threshold (>= 5)', () => {
    expect(shouldAutoPost({ ...mockIssue, confirmations: 5, socialConsent: 'tag' })).toBe(true);
  });

  it('does NOT auto-post below the threshold — even for Critical (confirmation-based, not severity)', () => {
    expect(shouldAutoPost({ ...mockIssue, severity: 'Critical', confirmations: 3, socialConsent: 'anonymous' })).toBe(false);
  });

  it('never auto-posts when consent is none', () => {
    expect(shouldAutoPost({ ...mockIssue, confirmations: 99, socialConsent: 'none' })).toBe(false);
  });

  it('does NOT auto-post for low confirmations regardless of severity', () => {
    expect(shouldAutoPost({ ...mockIssue, severity: 'Low', confirmations: 2, socialConsent: 'anonymous' })).toBe(false);
  });
});

describe('Issue Types & Constants', () => {
  it('has 7+ issue types including Traffic Signal', () => {
    expect(ISSUE_TYPES.length).toBeGreaterThanOrEqual(7);
    expect(ISSUE_TYPES.find(t => t.value === 'Traffic Signal')).toBeTruthy();
  });

  it('has 4 severity levels', () => {
    expect(SEVERITY_LEVELS).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });

  it('has 4 status pipeline stages', () => {
    expect(STATUS_PIPELINE).toEqual(['Reported', 'Verified', 'In Progress', 'Resolved']);
  });

  it('civic score points are positive numbers', () => {
    Object.values(CIVIC_SCORE_POINTS).forEach(pts => {
      expect(pts).toBeGreaterThan(0);
    });
  });

  it('level thresholds cover 0 to Infinity', () => {
    expect(LEVEL_THRESHOLDS[0].min).toBe(0);
    expect(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].max).toBe(Infinity);
  });

  it('badge conditions are functions', () => {
    BADGE_CONDITIONS.forEach(badge => {
      expect(typeof badge.condition).toBe('function');
    });
  });
});

describe('Department Mapping', () => {
  it('has mapping for all issue types', () => {
    const types = ['Pothole', 'Streetlight', 'Garbage', 'Water Leakage', 'Infrastructure', 'Other'];
    types.forEach(type => {
      expect(DEPARTMENT_MAP[type]).toBeDefined();
      expect(DEPARTMENT_MAP[type].name).toBeTruthy();
      expect(DEPARTMENT_MAP[type].code).toBeTruthy();
      expect(DEPARTMENT_MAP[type].slaHours).toBeGreaterThan(0);
    });
  });
});

describe('Theme - Severity Styles', () => {
  it('returns correct style object for each severity', () => {
    ['Critical', 'High', 'Medium', 'Low'].forEach(sev => {
      const style = severityStyle(sev);
      expect(style.borderRadius).toBe('999px');
      expect(style.color).toBeTruthy();
      expect(style.backgroundColor).toBeTruthy();
    });
  });

  it('handles unknown severity', () => {
    const style = severityStyle('Unknown');
    expect(style.color).toBe('#475569');
  });
});

describe('Theme - Status Colors', () => {
  it('returns correct colors for each status', () => {
    expect(statusColor('Reported')).toBe('#475569');
    expect(statusColor('Verified')).toBe('#3b82f6');
    expect(statusColor('In Progress')).toBe('#f97316');
    expect(statusColor('Resolved')).toBe('#16a34a');
  });
});
