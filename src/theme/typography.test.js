import { describe, it, expect } from 'vitest';
import { typography } from './typography';

const TOKENS = ['h1', 'h2', 'h3', 'body', 'bodyM', 'sm', 'xs', 'label', 'score', 'brand', 'hindi', 'tag'];

describe('typography tokens', () => {
  it('exposes the full set of text style tokens', () => {
    expect(Object.keys(typography)).toEqual(TOKENS);
  });

  it('every token has a px fontSize and a string fontWeight (never the word "bold")', () => {
    for (const token of TOKENS) {
      const style = typography[token];
      expect(style.fontSize).toMatch(/^\d+px$/);
      expect(typeof style.fontWeight).toBe('string');
      expect(style.fontWeight).toMatch(/^[1-8]00$/);
      expect(style.fontWeight).not.toBe('bold');
    }
  });

  it('every token carries a hex color', () => {
    for (const token of TOKENS) {
      expect(typography[token].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('headings use the off-white primary text color', () => {
    expect(typography.h1.color).toBe('#f0f6ff');
    expect(typography.h2.color).toBe('#f0f6ff');
    expect(typography.h3.color).toBe('#f0f6ff');
    expect(typography.h1.fontSize).toBe('26px');
    expect(typography.h1.fontWeight).toBe('700');
  });

  it('body text uses the secondary body color and a comfortable line height', () => {
    expect(typography.body.color).toBe('#94a3b8');
    expect(typography.body.fontSize).toBe('14px');
    expect(typography.body.lineHeight).toBe(1.6);
  });

  it('score and brand tokens use the cyan brand color at weight 800', () => {
    expect(typography.score.color).toBe('#00d4ff');
    expect(typography.score.fontSize).toBe('44px');
    expect(typography.score.fontWeight).toBe('800');
    expect(typography.brand.color).toBe('#00d4ff');
    expect(typography.brand.fontWeight).toBe('800');
  });

  it('the hindi token uses the light-green accent', () => {
    expect(typography.hindi.color).toBe('#86efac');
  });

  it('label and tag tokens are uppercase with letter spacing', () => {
    expect(typography.label.textTransform).toBe('uppercase');
    expect(typography.label.letterSpacing).toBe('0.7px');
    expect(typography.tag.textTransform).toBe('uppercase');
    expect(typography.tag.letterSpacing).toBe('1.2px');
  });
});
