import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// aiProxy.js captures AI_WEBHOOK once at module load (const AI_WEBHOOK = import.meta.env...).
// So to exercise enabled vs disabled, we stub the env BEFORE a fresh dynamic import.
const loadModule = async (webhook) => {
  vi.resetModules();
  if (webhook === undefined) vi.stubEnv('VITE_N8N_AI_WEBHOOK', '');
  else vi.stubEnv('VITE_N8N_AI_WEBHOOK', webhook);
  return import('./aiProxy');
};

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

describe('isProxyEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is false when the webhook env var is unset / empty', async () => {
    const { isProxyEnabled } = await loadModule('');
    expect(isProxyEnabled()).toBe(false);
  });

  it('is true when the webhook env var is a non-empty URL', async () => {
    const { isProxyEnabled } = await loadModule('https://n8n.example.com/webhook/ai');
    expect(isProxyEnabled()).toBe(true);
  });
});

describe('fetchViaProxy', () => {
  const WEBHOOK = 'https://n8n.example.com/webhook/ai';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('POSTs the parts to the webhook and returns cleaned text from { text }', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue(okJson({ text: '```json\n{"a":1}\n```' }));

    const parts = [{ text: 'hello' }];
    const out = await fetchViaProxy(parts);

    // fences stripped + trimmed
    expect(out).toBe('{"a":1}');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.provider).toBe('gemini');
    expect(body.parts).toEqual(parts);
  });

  it('reads the { output } shape when text is absent', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue(okJson({ output: 'plain answer' }));
    expect(await fetchViaProxy([{ text: 'q' }])).toBe('plain answer');
  });

  it('reads the array [{ text }] shape', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue(okJson([{ text: 'arr answer' }]));
    expect(await fetchViaProxy([{ text: 'q' }])).toBe('arr answer');
  });

  it('reads the array [{ json: { text } }] shape', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue(okJson([{ json: { text: 'nested answer' } }]));
    expect(await fetchViaProxy([{ text: 'q' }])).toBe('nested answer');
  });

  it('reads a raw string response', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => 'raw string answer' });
    expect(await fetchViaProxy([{ text: 'q' }])).toBe('raw string answer');
  });

  it('throws on a non-ok HTTP status, surfacing the status code', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(fetchViaProxy([{ text: 'q' }])).rejects.toThrow('AI proxy HTTP 502');
  });

  it('throws when the proxy returns an unrecognized / empty payload', async () => {
    const { fetchViaProxy } = await loadModule(WEBHOOK);
    fetch.mockResolvedValue(okJson({ something: 'else' }));
    await expect(fetchViaProxy([{ text: 'q' }])).rejects.toThrow('Empty response from AI proxy');
  });
});
