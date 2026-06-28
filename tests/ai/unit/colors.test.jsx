import { describe, it, expect } from 'vitest';
import { colors } from '../../../src/theme/colors';

describe('colors.js', () => {
  it('should export a constant object named colors', () => {
    expect(typeof colors).toBe('object');
    expect(colors).not.toBeNull();
    expect(Array.isArray(colors)).toBe(false);
  });

  it('should contain a specific number of color keys', () => {
    const expectedKeyCount = 29; // Manually count keys from the provided file
    expect(Object.keys(colors).length).toBe(expectedKeyCount);
  });

  it('should have expected background and border colors', () => {
    expect(colors.bgDeepest).toBe('#04091a');
    expect(colors.bgBase).toBe('#080f1e');
    expect(colors.bgCard).toBe('#0d1b2e');
    expect(colors.bgElevated).toBe('#112035');
    expect(colors.bgHover).toBe('#152540');
    expect(colors.border).toBe('#1a2f4a');
    expect(colors.borderFocus).toBe('#00d4ff');
  });

  it('should have expected cyan and green palette colors', () => {
    expect(colors.cyan).toBe('#00d4ff');
    expect(colors.cyanDark).toBe('#00a8cc');
    expect(colors.cyanLight).toBe('#7ee8fa');
    expect(colors.cyanGlow).toBe('#00d4ff20');

    expect(colors.green).toBe('#16a34a');
    expect(colors.greenDark).toBe('#059669');
    expect(colors.greenLight).toBe('#86efac');
    expect(colors.greenGlow).toBe('#16a34a20');
  });

  it('should have expected status/severity and workflow colors', () => {
    expect(colors.critical).toBe('#ef4444');
    expect(colors.high).toBe('#f97316');
    expect(colors.medium).toBe('#eab308');
    expect(colors.low).toBe('#22c55e');

    expect(colors.reported).toBe('#475569');
    expect(colors.verified).toBe('#3b82f6');
    expect(colors.inProgress).toBe('#f97316');
    expect(colors.resolved).toBe('#16a34a');
  });

  it('should have expected text colors', () => {
    expect(colors.textPrimary).toBe('#f0f6ff');
    expect(colors.textSecondary).toBe('#94a3b8');
    expect(colors.textMuted).toBe('#4a6280');
    expect(colors.textCyan).toBe('#00d4ff');
    expect(colors.textGreen).toBe('#86efac');
    expect(colors.textLink).toBe('#00d4ff');
  });

  it('all color values should be valid hex strings', () => {
    const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    for (const key in colors) {
      if (Object.prototype.hasOwnProperty.call(colors, key)) {
        const value = colors[key];
        expect(typeof value).toBe('string');
        expect(value).toMatch(hexColorRegex);
      }
    }
  });
});