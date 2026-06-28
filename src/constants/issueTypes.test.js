import { describe, it, expect } from 'vitest';
import { levelFor } from './issueTypes';

describe('levelFor', () => {
  it('maps scores to level names by threshold', () => {
    expect(levelFor(0)).toBe('Newcomer');
    expect(levelFor(50)).toBe('Newcomer');
    expect(levelFor(51)).toBe('Reporter');
    expect(levelFor(150)).toBe('Reporter');
    expect(levelFor(151)).toBe('Guardian');
    expect(levelFor(300)).toBe('Guardian');
    expect(levelFor(301)).toBe('Local Hero');
    expect(levelFor(500)).toBe('Local Hero');
    expect(levelFor(501)).toBe('City Guardian');
    expect(levelFor(99999)).toBe('City Guardian');
  });
  it('defaults to Newcomer for no/zero score', () => {
    expect(levelFor()).toBe('Newcomer');
  });
});
