import { describe, it, expect } from 'vitest';
import { spacing, radius } from './spacing';

describe('spacing scale', () => {
  it('exposes the full named scale', () => {
    expect(Object.keys(spacing)).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl']);
  });

  it('every value is a px string', () => {
    Object.values(spacing).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v).toMatch(/^\d+px$/);
    });
  });

  it('has representative anchor values', () => {
    expect(spacing.xs).toBe('4px');
    expect(spacing.md).toBe('12px');
    expect(spacing.lg).toBe('16px');
    expect(spacing.xxxl).toBe('48px');
  });

  it('increases monotonically from xs to xxxl', () => {
    const order = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'];
    const nums = order.map((k) => parseInt(spacing[k], 10));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeGreaterThan(nums[i - 1]);
    }
  });
});

describe('radius scale', () => {
  it('exposes the named radii including the pill token', () => {
    expect(Object.keys(radius)).toEqual(['sm', 'md', 'lg', 'xl', 'pill']);
  });

  it('every value is a px string', () => {
    Object.values(radius).forEach((v) => expect(v).toMatch(/^\d+px$/));
  });

  it('uses the CLAUDE.md card/button radii and a 999px pill', () => {
    expect(radius.md).toBe('10px'); // primary button radius
    expect(radius.lg).toBe('14px'); // card radius
    expect(radius.pill).toBe('999px');
  });
});
