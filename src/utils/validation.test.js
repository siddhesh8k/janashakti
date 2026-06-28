import { describe, it, expect } from 'vitest';
import {
  isReportBlocked, isValidHandle, normalizeHandle,
  isValidImageFile, validateReport, MIN_CONFIDENCE, MESSAGES,
} from './validation';

describe('isReportBlocked', () => {
  it('blocks when AI says not genuine', () => {
    expect(isReportBlocked({ is_genuine: false, confidence: 90 })).toBe(true);
  });
  it('blocks when confidence is below the threshold', () => {
    expect(isReportBlocked({ is_genuine: true, confidence: MIN_CONFIDENCE - 1 })).toBe(true);
  });
  it('allows a genuine, confident analysis', () => {
    expect(isReportBlocked({ is_genuine: true, confidence: 85 })).toBe(false);
  });
  it('does not block when there is no analysis (AI outage / manual fallback)', () => {
    expect(isReportBlocked(null)).toBe(false);
    expect(isReportBlocked(undefined)).toBe(false);
  });
});

describe('isValidHandle / normalizeHandle', () => {
  it('accepts handles with or without @', () => {
    expect(isValidHandle('@civic_user')).toBe(true);
    expect(isValidHandle('CivicUser1')).toBe(true);
  });
  it('rejects empty, too long, or bad chars', () => {
    expect(isValidHandle('')).toBe(false);
    expect(isValidHandle('way_too_long_handle_123')).toBe(false);
    expect(isValidHandle('bad handle!')).toBe(false);
  });
  it('strips a leading @', () => {
    expect(normalizeHandle('@abc')).toBe('abc');
    expect(normalizeHandle('abc')).toBe('abc');
  });
});

describe('isValidImageFile', () => {
  it('accepts an image under the size cap', () => {
    expect(isValidImageFile({ type: 'image/jpeg', size: 1000 })).toBe(true);
  });
  it('rejects non-images and oversized files', () => {
    expect(isValidImageFile({ type: 'video/mp4', size: 1000 })).toBe(false);
    expect(isValidImageFile({ type: 'image/png', size: 99 * 1024 * 1024 })).toBe(false);
    expect(isValidImageFile(null)).toBe(false);
  });
});

describe('validateReport', () => {
  const ok = { base64: 'abc', mediaMode: 'photo', address: 'MG Road, Bangalore', socialConsent: 'anonymous' };

  it('passes a complete photo report', () => {
    expect(validateReport(ok)).toEqual({ ok: true, message: '' });
  });
  it('requires media', () => {
    expect(validateReport({ ...ok, base64: null }).message).toBe(MESSAGES.noMedia);
  });
  it('accepts a video file as media', () => {
    expect(validateReport({ ...ok, base64: null, mediaMode: 'video', videoFile: {} }).ok).toBe(true);
  });
  it('requires a real location', () => {
    expect(validateReport({ ...ok, address: 'Location not available' }).message).toBe(MESSAGES.noLocation);
    expect(validateReport({ ...ok, address: '' }).message).toBe(MESSAGES.noLocation);
  });
  it('requires a valid handle only when tagging', () => {
    expect(validateReport({ ...ok, socialConsent: 'tag', xHandle: '' }).message).toBe(MESSAGES.badHandle);
    expect(validateReport({ ...ok, socialConsent: 'tag', xHandle: '@ok_handle' }).ok).toBe(true);
  });
});
