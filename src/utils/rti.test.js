import { describe, it, expect } from 'vitest';
import { buildRTIApplication, formatINDate, DEFAULT_RTI_POINTS } from './rti';

describe('buildRTIApplication', () => {
  const base = {
    name: 'Asha Rao',
    email: 'asha@example.com',
    address: 'MG Road, Bangalore, Karnataka',
    city: 'Bangalore',
    issueType: 'Pothole',
    department: 'BBMP Roads Dept',
    complaintId: 'BLR-2026-0042',
    reportedOn: '12 June 2026',
    infoPoints: ['Work order copies', 'Budget allocated'],
  };

  it('binds the dynamic fields into the document', () => {
    const out = buildRTIApplication(base);
    expect(out).toContain('Asha Rao');
    expect(out).toContain('asha@example.com');
    expect(out).toContain('MG Road, Bangalore, Karnataka');
    expect(out).toContain('Pothole');
    expect(out).toContain('BBMP Roads Dept');
    expect(out).toContain('BLR-2026-0042');
    expect(out).toContain('12 June 2026');
    expect(out).toContain('Bangalore');
  });

  it('numbers the provided information points without duplication', () => {
    const out = buildRTIApplication(base);
    expect(out).toContain('1. Work order copies');
    expect(out).toContain('2. Budget allocated');
    // The applicant name appears once in the salutation line and once in the
    // signature block — and nowhere else duplicated.
    expect(out.match(/Asha Rao/g)).toHaveLength(2);
    // Complaint reference appears exactly once.
    expect(out.match(/BLR-2026-0042/g)).toHaveLength(1);
  });

  it('falls back to default points when none are supplied', () => {
    const out = buildRTIApplication({ ...base, infoPoints: [] });
    expect(out).toContain(`1. ${DEFAULT_RTI_POINTS[0]}`);
  });

  it('drops blank signature lines when fields are missing', () => {
    const out = buildRTIApplication({ issueType: 'Garbage' });
    expect(out).toContain('Concerned Citizen');
    expect(out).not.toContain('Email:');
    expect(out).not.toContain('Place:');
    // No stray placeholder brackets anywhere.
    expect(out).not.toMatch(/\[[^\]]+\]/);
  });

  it('cites the RTI Act sections', () => {
    const out = buildRTIApplication(base);
    expect(out).toContain('Section 6(1)');
    expect(out).toContain('Section 7');
    expect(out).toContain('Right to Information Act, 2005');
  });
});

describe('formatINDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatINDate(null)).toBe('');
    expect(formatINDate(undefined)).toBe('');
  });

  it('formats a Firestore-style timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-12T00:00:00Z') };
    expect(formatINDate(ts)).toMatch(/2026/);
  });

  it('formats an ISO string', () => {
    expect(formatINDate('2026-06-12T00:00:00Z')).toMatch(/2026/);
  });
});
