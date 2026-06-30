import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_VIDEO_DURATION, getVideoDuration, extractVideoFrame } from './media';

// These helpers are DOM/canvas driven, so we stub <video>/<canvas>, URL.createObjectURL,
// and the real document.createElement. A fake <video> fires onloadedmetadata / onseeked /
// onerror when its .src is assigned, letting us deterministically exercise both branches.

const realCreateElement = document.createElement.bind(document);
let revoked = [];

// Build a fake <video> whose behaviour on src-assignment is configurable.
const makeVideoElement = (cfg) => {
  const v = {
    preload: '', muted: false, playsInline: false,
    currentTime: 0, duration: cfg.duration ?? 8,
    videoWidth: cfg.width ?? 640, videoHeight: cfg.height ?? 480,
    onloadedmetadata: null, onseeked: null, onerror: null,
    _src: '',
  };
  Object.defineProperty(v, 'src', {
    get() { return v._src; },
    set(val) {
      v._src = val;
      // Simulate async media decoding on the next microtask.
      Promise.resolve().then(() => {
        if (cfg.fail) { v.onerror && v.onerror(); return; }
        v.onloadedmetadata && v.onloadedmetadata();
        // Assigning currentTime in the handler "seeks"; fire onseeked next tick.
        if (v.onseeked) Promise.resolve().then(() => v.onseeked());
      });
    },
  });
  return v;
};

const makeCanvasElement = (cfg) => ({
  width: 0, height: 0,
  getContext: cfg.noCtx ? vi.fn(() => null) : vi.fn(() => ({ drawImage: vi.fn() })),
  toDataURL: vi.fn(() => 'data:image/jpeg;base64,ZZZ'),
});

// Install fakes. `cfg` controls the video's reported metadata and failure mode.
const installDom = (cfg = {}) => {
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'video') return makeVideoElement(cfg);
    if (tag === 'canvas') return makeCanvasElement(cfg);
    return realCreateElement(tag);
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake-url'),
    revokeObjectURL: vi.fn((u) => revoked.push(u)),
  });
};

describe('media constants', () => {
  it('caps civic video clips at 10 seconds', () => {
    expect(MAX_VIDEO_DURATION).toBe(10);
  });
});

describe('getVideoDuration', () => {
  beforeEach(() => { revoked = []; });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('resolves with the decoded duration and revokes the object URL', async () => {
    installDom({ duration: 7.5 });

    const d = await getVideoDuration(new Blob(['x'], { type: 'video/mp4' }));

    expect(d).toBe(7.5);
    expect(revoked).toContain('blob:fake-url');
  });

  it('rejects when the file cannot be decoded as video', async () => {
    installDom({ fail: true });

    await expect(getVideoDuration(new Blob(['x']))).rejects.toThrow('Cannot read video');
  });
});

describe('extractVideoFrame', () => {
  beforeEach(() => { revoked = []; });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('returns the base64 jpeg payload without the data: prefix', async () => {
    installDom({ duration: 8, width: 320, height: 240 });

    const frame = await extractVideoFrame(new Blob(['x'], { type: 'video/mp4' }), 1);

    // toDataURL returned 'data:image/jpeg;base64,ZZZ' → only the payload survives.
    expect(frame).toBe('ZZZ');
    expect(revoked).toContain('blob:fake-url');
  });

  it('seeks to min(atSeconds, duration/2) so the grab never overruns the clip', async () => {
    let seekedTo = null;
    // Capture currentTime by spying through a custom video element.
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return makeCanvasElement({});
      if (tag !== 'video') return realCreateElement(tag);
      const v = {
        preload: '', muted: false, playsInline: false, duration: 4,
        videoWidth: 100, videoHeight: 100,
        onloadedmetadata: null, onseeked: null, onerror: null, _src: '', _ct: 0,
      };
      Object.defineProperty(v, 'currentTime', {
        get() { return v._ct; },
        set(val) { v._ct = val; seekedTo = val; },
      });
      Object.defineProperty(v, 'src', {
        get() { return v._src; },
        set(val) {
          v._src = val;
          Promise.resolve().then(() => {
            v.onloadedmetadata && v.onloadedmetadata();
            if (v.onseeked) Promise.resolve().then(() => v.onseeked());
          });
        },
      });
      return v;
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:u'), revokeObjectURL: vi.fn() });

    // atSeconds=10 but duration is 4 → clamps to duration/2 = 2.
    await extractVideoFrame(new Blob(['x']), 10);
    expect(seekedTo).toBe(2);
  });

  it('sizes the canvas to the video\'s native resolution', async () => {
    let captured = null;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'video') return makeVideoElement({ duration: 8, width: 1280, height: 720 });
      if (tag === 'canvas') { captured = makeCanvasElement({}); return captured; }
      return realCreateElement(tag);
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:u'), revokeObjectURL: vi.fn() });

    await extractVideoFrame(new Blob(['x']), 1);

    expect(captured.width).toBe(1280);
    expect(captured.height).toBe(720);
  });

  it('rejects when the video errors before a frame can be grabbed', async () => {
    installDom({ fail: true });

    await expect(extractVideoFrame(new Blob(['x']), 1)).rejects.toThrow('Cannot extract frame');
  });

  it('rejects (does not throw synchronously) when canvas drawing fails', async () => {
    // getContext returns null → calling .drawImage on null throws inside onseeked,
    // which the guard catches and routes to reject().
    installDom({ duration: 8, noCtx: true });

    await expect(extractVideoFrame(new Blob(['x']), 1)).rejects.toBeInstanceOf(Error);
  });
});
