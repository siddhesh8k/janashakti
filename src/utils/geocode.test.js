import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reverseGeocode, forwardGeocode } from './geocode';

// Both functions read VITE_GOOGLE_MAPS_KEY inside the call (not at module load),
// so vi.stubEnv per-test takes effect immediately. fetch is the network seam.

const okJson = (body) => ({ ok: true, json: async () => body });

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'real-key-123');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the formatted_address from the first result and calls the geocode endpoint', async () => {
    fetch.mockResolvedValue(okJson({
      results: [{ formatted_address: '12 MG Road, Bengaluru, Karnataka 560001, India' }],
    }));

    const out = await reverseGeocode(12.9716, 77.5946);
    expect(out).toBe('12 MG Road, Bengaluru, Karnataka 560001, India');

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url).toContain('latlng=12.9716,77.5946');
    expect(url).toContain('key=real-key-123');
  });

  it('falls back to "lat, lng" (4dp) when there are zero results', async () => {
    fetch.mockResolvedValue(okJson({ results: [], status: 'ZERO_RESULTS' }));
    const out = await reverseGeocode(12.9716, 77.5946);
    expect(out).toBe('12.9716, 77.5946');
  });

  it('falls back to "lat, lng" when fetch throws', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    const out = await reverseGeocode(19.076, 72.8777);
    expect(out).toBe('19.0760, 72.8777');
  });

  it('returns the coord fallback WITHOUT calling fetch when the key is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', '');
    const out = await reverseGeocode(28.6139, 77.209);
    expect(out).toBe('28.6139, 77.2090');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the coord fallback WITHOUT calling fetch when the key is the placeholder', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'your_google_maps_key_here');
    const out = await reverseGeocode(13.0827, 80.2707);
    expect(out).toBe('13.0827, 80.2707');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('forwardGeocode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'real-key-123');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { lat, lng } from the first result geometry and url-encodes the address', async () => {
    fetch.mockResolvedValue(okJson({
      results: [{ geometry: { location: { lat: 12.34, lng: 56.78 } } }],
    }));

    const out = await forwardGeocode('MG Road, Bangalore');
    expect(out).toEqual({ lat: 12.34, lng: 56.78 });

    const url = fetch.mock.calls[0][0];
    expect(url).toContain('address=MG%20Road%2C%20Bangalore');
    expect(url).toContain('key=real-key-123');
  });

  it('returns null when there are no results (no geometry/location)', async () => {
    fetch.mockResolvedValue(okJson({ results: [], status: 'ZERO_RESULTS' }));
    expect(await forwardGeocode('Nowhere at all')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    fetch.mockRejectedValue(new Error('boom'));
    expect(await forwardGeocode('Somewhere')).toBeNull();
  });

  it('returns null without fetching for an empty / whitespace address', async () => {
    expect(await forwardGeocode('')).toBeNull();
    expect(await forwardGeocode('   ')).toBeNull();
    expect(await forwardGeocode(undefined)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null without fetching when the key is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', '');
    expect(await forwardGeocode('MG Road, Bangalore')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
