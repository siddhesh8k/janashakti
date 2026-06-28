import { describe, it, expect } from 'vitest';
import { distanceKm, VERIFY_RADIUS_KM } from './geo';

describe('distanceKm', () => {
  it('is 0 for the same point', () => {
    expect(distanceKm(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });
  it('returns Infinity when a coordinate is missing', () => {
    expect(distanceKm(12.97, 77.59, undefined, 77.59)).toBe(Infinity);
  });
  it('approximates ~0.5 km for a 0.0045° latitude step', () => {
    const d = distanceKm(12.9716, 77.5946, 12.9716 + 0.0045, 77.5946);
    expect(d).toBeGreaterThan(0.45);
    expect(d).toBeLessThan(0.55);
  });
  it('is well beyond the verify radius for far-apart cities', () => {
    const d = distanceKm(12.9716, 77.5946, 19.0760, 72.8777); // Bangalore → Mumbai
    expect(d).toBeGreaterThan(VERIFY_RADIUS_KM);
    expect(d).toBeGreaterThan(800); // ~840 km
  });
});
