import { describe, it, expect } from 'vitest';
import { anonymizeName, sanitizeIssue, CONFIDENTIAL_FIELDS } from './exportToExcel';

describe('anonymizeName', () => {
  it('keeps first + last char, masks the middle, per word', () => {
    expect(anonymizeName('Nikitha Sharma')).toBe('N*****a S****a');
  });
  it('handles short words and empties', () => {
    expect(anonymizeName('Jo Li')).toBe('J* L*');
    expect(anonymizeName('')).toBe('Anonymous');
    expect(anonymizeName(undefined)).toBe('Anonymous');
  });
});

describe('sanitizeIssue — privacy guarantees', () => {
  const raw = {
    id: 'doc1', complaintId: 'JS-BLR-2026-0001', issueType: 'Pothole', severity: 'High',
    status: 'Reported', description: 'Big pothole', locationText: 'MG Road, Bangalore',
    city: 'Bangalore', confirmations: 7, userName: 'Nikitha Sharma',
    // sensitive fields that must NOT leak:
    userId: 'firebase-uid-xyz', userEmail: 'nik@example.com', userPhoto: 'https://x/p.jpg',
    userXHandle: '@nik', photoUrl: 'data:image/jpeg;base64,AAAA', resolutionPhotoUrl: 'data:...',
    confirmedBy: ['uidA', 'uidB'], storyClaimedBy: 'uidC', location: { lat: 12.9, lng: 77.5 },
    xPostUrl: 'https://x.com/p', rtiDocUrl: 'https://x/rti', statusHistory: [{ changedBy: 'uidD' }],
    createdAt: new Date('2026-06-01T00:00:00Z'),
  };
  const out = sanitizeIssue(raw);

  it('exports public fields', () => {
    expect(out['Complaint ID']).toBe('JS-BLR-2026-0001');
    expect(out['Issue Type']).toBe('Pothole');
    expect(out['Confirmations']).toBe(7); // count only
    expect(out['Location']).toBe('MG Road, Bangalore'); // text, not coords
  });

  it('masks the reporter name and never exports the raw name', () => {
    expect(out['Reporter']).toBe('N*****a S****a');
    expect(JSON.stringify(out)).not.toContain('Nikitha Sharma');
  });

  it('leaks NONE of the confidential values', () => {
    const blob = JSON.stringify(out);
    for (const v of ['firebase-uid-xyz', 'nik@example.com', '@nik', 'p.jpg',
                     'base64', 'uidA', 'uidB', 'uidC', 'uidD', 'x.com/p', '/rti',
                     '12.9', '77.5']) {
      expect(blob).not.toContain(v);
    }
  });

  it('output keys never include any confidential field name', () => {
    const keys = Object.keys(out);
    for (const f of CONFIDENTIAL_FIELDS) expect(keys).not.toContain(f);
  });
});
