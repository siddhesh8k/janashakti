import { describe, it, expect } from 'vitest';
import { videoPosterUrl, cloudinaryThumb } from './cloudinary';

describe('videoPosterUrl', () => {
  it('returns "" for a falsy url', () => {
    expect(videoPosterUrl('')).toBe('');
    expect(videoPosterUrl(null)).toBe('');
    expect(videoPosterUrl(undefined)).toBe('');
  });

  it('inserts the so_0 frame and swaps the extension to jpg', () => {
    const url = 'https://res.cloudinary.com/demo/video/upload/v123/clip.mp4';
    expect(videoPosterUrl(url)).toBe(
      'https://res.cloudinary.com/demo/video/upload/so_0/v123/clip.jpg'
    );
  });

  it('handles webm and mov extensions', () => {
    expect(videoPosterUrl('https://x/upload/a.webm')).toBe('https://x/upload/so_0/a.jpg');
    expect(videoPosterUrl('https://x/upload/a.mov')).toBe('https://x/upload/so_0/a.jpg');
  });
});

describe('cloudinaryThumb', () => {
  it('leaves non-Cloudinary and falsy URLs untouched', () => {
    expect(cloudinaryThumb('')).toBe('');
    expect(cloudinaryThumb(null)).toBe(null);
    expect(cloudinaryThumb('data:image/jpeg;base64,abc')).toBe('data:image/jpeg;base64,abc');
    expect(cloudinaryThumb('https://images.pexels.com/a.jpg')).toBe('https://images.pexels.com/a.jpg');
  });

  it('rewrites an existing width transform segment to the target width', () => {
    const url = 'https://res.cloudinary.com/demo/image/fetch/w_800,h_600,c_fill,q_auto,f_jpg/https://images.pexels.com/x.jpeg';
    const out = cloudinaryThumb(url, 480);
    expect(out).toContain('/image/fetch/w_480,c_fill,q_auto,f_auto/');
    expect(out).not.toContain('w_800');
    expect(out).toContain('https://images.pexels.com/x.jpeg');
  });

  it('injects a transform when none is present', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/clip.jpg';
    expect(cloudinaryThumb(url, 320)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_320,c_fill,q_auto,f_auto/v1/clip.jpg'
    );
  });
});
