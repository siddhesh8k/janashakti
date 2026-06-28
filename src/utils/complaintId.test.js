import { describe, it, expect } from 'vitest';
import { generateComplaintId } from './complaintId';

describe('generateComplaintId', () => {
  const year = new Date().getFullYear();

  it('maps known cities to their code', () => {
    expect(generateComplaintId('Bangalore')).toMatch(new RegExp(`^JS-BLR-${year}-\\d{5}$`));
    expect(generateComplaintId('Mumbai')).toMatch(new RegExp(`^JS-MUM-${year}-\\d{5}$`));
  });
  it('derives a 3-letter code for unknown cities', () => {
    expect(generateComplaintId('Kochi')).toMatch(new RegExp(`^JS-KOC-${year}-\\d{5}$`));
  });
  it('falls back to OTH when no city is given', () => {
    expect(generateComplaintId('')).toMatch(new RegExp(`^JS-OTH-${year}-\\d{5}$`));
  });
});
