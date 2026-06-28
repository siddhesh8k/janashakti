import { describe, it, expect } from 'vitest';
import { DEPARTMENT_MAP } from '../../../src/constants/departments';

describe('DEPARTMENT_MAP constant', () => {
  // Test Case 1: Ensure DEPARTMENT_MAP is defined and is an object
  it('should be defined and be an object', () => {
    expect(DEPARTMENT_MAP).toBeDefined();
    expect(typeof DEPARTMENT_MAP).toBe('object');
    expect(DEPARTMENT_MAP).not.toBeNull();
  });

  // Test Case 2: Ensure DEPARTMENT_MAP contains a reasonable number of entries
  // and specific key examples
  it('should contain a specific number of entries and known keys', () => {
    const expectedNumberOfEntries = 21; // Manually counted from the provided code
    expect(Object.keys(DEPARTMENT_MAP).length).toBe(expectedNumberOfEntries);
    expect(DEPARTMENT_MAP).toHaveProperty('Pothole');
    expect(DEPARTMENT_MAP).toHaveProperty('Streetlight');
    expect(DEPARTMENT_MAP).toHaveProperty('Garbage');
    expect(DEPARTMENT_MAP).toHaveProperty('Water Leakage');
    expect(DEPARTMENT_MAP).toHaveProperty('Infrastructure');
    expect(DEPARTMENT_MAP).toHaveProperty('Traffic Signal');
    expect(DEPARTMENT_MAP).toHaveProperty('Broken Road');
    expect(DEPARTMENT_MAP).toHaveProperty('Other'); // Check the 'Other' category
  });

  // Test Case 3: Validate the structure and data types of a specific entry (e.g., 'Pothole')
  it('should have correct structure and data types for a specific entry like "Pothole"', () => {
    const potholeDepartment = DEPARTMENT_MAP.Pothole;
    expect(potholeDepartment).toBeDefined();
    expect(typeof potholeDepartment).toBe('object');

    expect(potholeDepartment).toHaveProperty('name');
    expect(typeof potholeDepartment.name).toBe('string');
    expect(potholeDepartment.name).toBe('Roads & Infrastructure Department');

    expect(potholeDepartment).toHaveProperty('code');
    expect(typeof potholeDepartment.code).toBe('string');
    expect(potholeDepartment.code).toBe('ROADS');

    expect(potholeDepartment).toHaveProperty('email');
    expect(typeof potholeDepartment.email).toBe('string');
    expect(potholeDepartment.email).toBe('roads@municipality.gov.in');

    expect(potholeDepartment).toHaveProperty('slaHours');
    expect(typeof potholeDepartment.slaHours).toBe('number');
    expect(potholeDepartment.slaHours).toBe(72);
    expect(potholeDepartment.slaHours).toBeGreaterThan(0);
  });

  // Test Case 4: Validate the structure and data types for ALL entries in DEPARTMENT_MAP
  it('should ensure all department entries have the correct structure and valid data', () => {
    const departmentKeys = Object.keys(DEPARTMENT_MAP);
    expect(departmentKeys.length).toBeGreaterThan(0); // Ensure there's something to iterate

    departmentKeys.forEach((key) => {
      const department = DEPARTMENT_MAP[key];
      expect(department).toBeDefined();
      expect(typeof department).toBe('object');
      expect(department).not.toBeNull();

      // Check for required properties
      expect(department).toHaveProperty('name');
      expect(department).toHaveProperty('code');
      expect(department).toHaveProperty('email');
      expect(department).toHaveProperty('slaHours');

      // Validate data types and basic content for each property
      expect(typeof department.name).toBe('string');
      expect(department.name.length).toBeGreaterThan(0);

      expect(typeof department.code).toBe('string');
      expect(department.code.length).toBeGreaterThan(0);

      expect(typeof department.email).toBe('string');
      expect(department.email.length).toBeGreaterThan(0);
      expect(department.email).toContain('@'); // Basic email format check
      expect(department.email).toContain('.'); // Basic email format check

      expect(typeof department.slaHours).toBe('number');
      expect(department.slaHours).toBeGreaterThan(0); // SLA hours should always be positive
    });
  });

  // Test Case 5: Codes are intentionally shared across related categories
  // (e.g. 'Pothole' and 'Broken Road' both map to the ROADS department), so the
  // number of distinct codes is smaller than the number of entries.
  it('should reuse department codes across related categories', () => {
    const codes = Object.values(DEPARTMENT_MAP).map((dept) => dept.code);
    const uniqueCodes = new Set(codes);
    // Fewer unique codes than entries because related issue types share a department.
    expect(uniqueCodes.size).toBeLessThan(codes.length);
    // Pothole and Broken Road share the ROADS code.
    expect(DEPARTMENT_MAP.Pothole.code).toBe(DEPARTMENT_MAP['Broken Road'].code);
    expect(DEPARTMENT_MAP.Pothole.code).toBe('ROADS');
    // Every code is a non-empty string.
    codes.forEach((code) => {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });
  });

  // Test Case 6: Validate the 'Other' entry specifically
  it('should have correct details for the "Other" department', () => {
    const otherDepartment = DEPARTMENT_MAP.Other;
    expect(otherDepartment).toBeDefined();
    expect(otherDepartment.name).toBe('Municipal Corporation — General');
    expect(otherDepartment.code).toBe('GEN');
    expect(otherDepartment.email).toBe('complaints@municipality.gov.in');
    expect(otherDepartment.slaHours).toBe(96);
  });
});