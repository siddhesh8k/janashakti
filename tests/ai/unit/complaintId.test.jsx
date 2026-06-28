import { describe, it, expect, vi, afterAll } from 'vitest';
import { generateComplaintId } from '../../../src/utils/complaintId';

describe('generateComplaintId', () => {
  const MOCK_YEAR = 2026;
  const MOCK_SEQ_VALUE = '00042'; // Corresponds to Math.random() returning 0.00042

  // Mock Date.getFullYear() to return a consistent year
  vi.setSystemTime(new Date(`${MOCK_YEAR}-01-01T00:00:00Z`));

  // Mock Math.random() to return a consistent value for predictable sequence numbers
  const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.00042);

  // After all tests, restore original Date and Math.random
  // This is important if other tests in the suite rely on unmocked Date/Math.random
  afterAll(() => {
    vi.useRealTimers();
    mathRandomSpy.mockRestore();
  });

  it('should generate a complaint ID with the correct format for a known city', () => {
    const complaintId = generateComplaintId('Bangalore');
    expect(complaintId).toMatch(/^JS-BLR-\d{4}-\d{5}$/);
    expect(complaintId).toBe(`JS-BLR-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should use the correct city code for an alias city name', () => {
    const complaintId = generateComplaintId('Bengaluru');
    expect(complaintId).toBe(`JS-BLR-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should generate a complaint ID with "OTH" for null city name', () => {
    const complaintId = generateComplaintId(null);
    expect(complaintId).toBe(`JS-OTH-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should generate a complaint ID with "OTH" for undefined city name', () => {
    const complaintId = generateComplaintId(undefined);
    expect(complaintId).toBe(`JS-OTH-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should generate a complaint ID with "OTH" for an empty string city name', () => {
    const complaintId = generateComplaintId('');
    expect(complaintId).toBe(`JS-OTH-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should generate a complaint ID with a derived code for an unlisted city name', () => {
    const complaintId = generateComplaintId('Kolkata');
    expect(complaintId).toBe(`JS-KOL-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should handle city names with spaces and special characters, deriving a code', () => {
    const complaintId = generateComplaintId('San Francisco');
    expect(complaintId).toBe(`JS-SAN-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should handle city names that become empty after cleaning, resulting in "OTH"', () => {
    const complaintId = generateComplaintId('123!@#');
    expect(complaintId).toBe(`JS-OTH-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should handle city names with less than 3 alphabetic characters', () => {
    const complaintIdShort = generateComplaintId('A');
    expect(complaintIdShort).toBe(`JS-A-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);

    const complaintIdTwoChars = generateComplaintId('AB');
    expect(complaintIdTwoChars).toBe(`JS-AB-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);

    const complaintIdMixedShort = generateComplaintId('A1');
    expect(complaintIdMixedShort).toBe(`JS-A-${MOCK_YEAR}-${MOCK_SEQ_VALUE}`);
  });

  it('should always include the current year in the ID', () => {
    const complaintId = generateComplaintId('Mumbai');
    expect(complaintId).toContain(`-${MOCK_YEAR}-`);
  });

  it('should always include a 5-digit sequence number', () => {
    const complaintId = generateComplaintId('Delhi');
    const parts = complaintId.split('-');
    expect(parts[3]).toHaveLength(5);
    expect(parts[3]).toMatch(/^\d{5}$/);
  });
});