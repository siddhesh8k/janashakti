import { describe, it, expect } from 'vitest';
import { shouldAutoPost } from './social';

describe('shouldAutoPost', () => {
  it('never posts when consent is none, even at high confirmations', () => {
    expect(shouldAutoPost({ socialConsent: 'none', confirmations: 99 })).toBe(false);
  });
  it('does NOT post on severity alone — needs 5 verifications', () => {
    expect(shouldAutoPost({ severity: 'Critical', confirmations: 1 })).toBe(false);
    expect(shouldAutoPost({ severity: 'Critical', confirmations: 4 })).toBe(false);
  });
  it('posts once confirmations reach the threshold (5)', () => {
    expect(shouldAutoPost({ severity: 'Low', confirmations: 5 })).toBe(true);
    expect(shouldAutoPost({ severity: 'Low', confirmations: 6 })).toBe(true);
  });
});
