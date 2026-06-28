import { describe, it, expect } from 'vitest';
import { styles, severityStyle, statusColor } from '../../../src/theme/components';

describe('theme/components', () => {

  describe('styles constant', () => {
    it('should be an object', () => {
      expect(typeof styles).toBe('object');
      expect(styles).not.toBeNull();
    });

    it('should contain expected top-level style objects', () => {
      expect(styles).toHaveProperty('screen');
      expect(styles).toHaveProperty('card');
      expect(styles).toHaveProperty('sectionHeader');
      expect(styles).toHaveProperty('btnPrimary');
      expect(styles).toHaveProperty('btnOutline');
      expect(styles).toHaveProperty('btnDanger');
      expect(styles).toHaveProperty('input');
      expect(styles).toHaveProperty('topNav');
      expect(styles).toHaveProperty('bottomNav');
      expect(styles).toHaveProperty('divider');
      expect(styles).toHaveProperty('statsCard');
    });

    it('should have screen style with specific properties', () => {
      expect(styles.screen).toBeInstanceOf(Object);
      expect(styles.screen).toHaveProperty('minHeight', '100vh');
      expect(styles.screen).toHaveProperty('backgroundColor', '#080f1e');
      expect(styles.screen).toHaveProperty('maxWidth', '480px');
    });

    it('should have btnPrimary style with specific properties', () => {
      expect(styles.btnPrimary).toBeInstanceOf(Object);
      expect(styles.btnPrimary).toHaveProperty('backgroundColor', '#00d4ff');
      expect(styles.btnPrimary).toHaveProperty('color', '#04091a');
      expect(styles.btnPrimary).toHaveProperty('borderRadius', '10px');
      expect(styles.btnPrimary).toHaveProperty('width', '100%');
    });

    it('should have input style with specific properties', () => {
      expect(styles.input).toBeInstanceOf(Object);
      expect(styles.input).toHaveProperty('backgroundColor', '#112035');
      expect(styles.input).toHaveProperty('color', '#f0f6ff');
      expect(styles.input).toHaveProperty('boxSizing', 'border-box');
    });

    it('should have topNav style with specific properties', () => {
      expect(styles.topNav).toBeInstanceOf(Object);
      expect(styles.topNav).toHaveProperty('position', 'sticky');
      expect(styles.topNav).toHaveProperty('zIndex', 100);
      expect(styles.topNav).toHaveProperty('backgroundColor', '#04091a');
    });
  });

  describe('severityStyle function', () => {
    it('should return correct styles for "Critical" severity', () => {
      const result = severityStyle('Critical');
      expect(result).toEqual({
        backgroundColor: '#ef44441a',
        color: '#ef4444',
        border: '0.5px solid #ef444440',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return correct styles for "High" severity', () => {
      const result = severityStyle('High');
      expect(result).toEqual({
        backgroundColor: '#f973161a',
        color: '#f97316',
        border: '0.5px solid #f9731640',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return correct styles for "Medium" severity', () => {
      const result = severityStyle('Medium');
      expect(result).toEqual({
        backgroundColor: '#eab3081a',
        color: '#eab308',
        border: '0.5px solid #eab30840',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return correct styles for "Low" severity', () => {
      const result = severityStyle('Low');
      expect(result).toEqual({
        backgroundColor: '#22c55e1a',
        color: '#22c55e',
        border: '0.5px solid #22c55e40',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return default styles for an unknown severity string', () => {
      const result = severityStyle('Unknown');
      expect(result).toEqual({
        backgroundColor: '#4755691a',
        color: '#475569',
        border: '0.5px solid #47556940',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return default styles for null input', () => {
      const result = severityStyle(null);
      expect(result).toEqual({
        backgroundColor: '#4755691a',
        color: '#475569',
        border: '0.5px solid #47556940',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return default styles for undefined input', () => {
      const result = severityStyle(undefined);
      expect(result).toEqual({
        backgroundColor: '#4755691a',
        color: '#475569',
        border: '0.5px solid #47556940',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });

    it('should return default styles for an empty string', () => {
      const result = severityStyle('');
      expect(result).toEqual({
        backgroundColor: '#4755691a',
        color: '#475569',
        border: '0.5px solid #47556940',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'inline-block',
      });
    });
  });

  describe('statusColor function', () => {
    it('should return correct color for "Reported" status', () => {
      expect(statusColor('Reported')).toBe('#475569');
    });

    it('should return correct color for "Verified" status', () => {
      expect(statusColor('Verified')).toBe('#3b82f6');
    });

    it('should return correct color for "In Progress" status', () => {
      expect(statusColor('In Progress')).toBe('#f97316');
    });

    it('should return correct color for "Resolved" status', () => {
      expect(statusColor('Resolved')).toBe('#16a34a');
    });

    it('should return default color for an unknown status string', () => {
      expect(statusColor('Pending')).toBe('#475569');
    });

    it('should return default color for null input', () => {
      expect(statusColor(null)).toBe('#475569');
    });

    it('should return default color for undefined input', () => {
      expect(statusColor(undefined)).toBe('#475569');
    });

    it('should return default color for an empty string', () => {
      expect(statusColor('')).toBe('#475569');
    });

    it('should return default color for a number input', () => {
      expect(statusColor(123)).toBe('#475569');
    });
  });
});