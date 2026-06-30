import { describe, it, expect } from 'vitest';
import { detectCity } from './cityDetect';

describe('detectCity', () => {
  it('maps known cities from a free-text address', () => {
    expect(detectCity('MG Road, Bangalore, Karnataka 560001')).toBe('Bangalore');
    expect(detectCity('Andheri West, Mumbai 400058')).toBe('Mumbai');
    expect(detectCity('Connaught Place, New Delhi')).toBe('Delhi');
    expect(detectCity('T. Nagar, Chennai, Tamil Nadu')).toBe('Chennai');
    expect(detectCity('Banjara Hills, Hyderabad')).toBe('Hyderabad');
    expect(detectCity('Koregaon Park, Pune, Maharashtra')).toBe('Pune');
  });

  it('resolves common aliases / adjacent municipalities', () => {
    expect(detectCity('Indiranagar, Bengaluru')).toBe('Bangalore');
    expect(detectCity('Colaba, Bombay')).toBe('Mumbai');
    expect(detectCity('Mylapore, Madras')).toBe('Chennai');
    expect(detectCity('Sector 62, Noida')).toBe('Delhi');
    expect(detectCity('Pimpri-Chinchwad')).toBe('Pune');
  });

  it('is case-insensitive', () => {
    expect(detectCity('hsr layout, BANGALORE')).toBe('Bangalore');
  });

  it('falls back to Other for unknown or empty addresses', () => {
    expect(detectCity('Some Village, Rajasthan')).toBe('Other');
    expect(detectCity('')).toBe('Other');
    expect(detectCity(null)).toBe('Other');
    expect(detectCity(undefined)).toBe('Other');
  });
});
