// Shared validation + guard-rail helpers. Pure functions so they're trivially
// testable and reusable across screens. Copy lives in MESSAGES so user-facing
// strings stay consistent.

export const MESSAGES = {
  noMedia:    'Add a photo or video of the issue first.',
  notCivic:   "This doesn't look like a civic issue. Please capture the actual problem.",
  noLocation: 'Add a valid location for this issue.',
  badHandle:  'Enter a valid X handle (letters, numbers, _ — up to 15 chars).',
  badImage:   'Please choose an image file under 10 MB.',
};

// ── Guard rail: block reports the AI judges non-genuine or low-confidence ──
export const MIN_CONFIDENCE = 40;

// Agent 1 self-evaluation: if a report isn't an outright rejection but the first
// pass lands below this, the analyzer re-examines the image once and keeps the more
// confident result (see agents/issueAnalyzer.js).
export const RETRY_THRESHOLD = 55;

export const isReportBlocked = (analysis) =>
  !!analysis && (analysis.is_genuine === false || (analysis.confidence ?? 0) < MIN_CONFIDENCE);

// ── X / Twitter handle ──
export const normalizeHandle = (h) => (h || '').trim().replace(/^@/, '');

export const isValidHandle = (h) => /^@?[A-Za-z0-9_]{1,15}$/.test((h || '').trim());

// ── Image file (authority resolution upload) ──
export const isValidImageFile = (file, maxBytes = 10 * 1024 * 1024) =>
  !!file && typeof file.type === 'string' && file.type.startsWith('image/') && file.size <= maxBytes;

// Placeholder/auto addresses that should not count as a real location.
const PLACEHOLDER_ADDRESSES = ['', 'location not available', 'detecting...'];

// First failing rule wins → { ok, message }.
export const validateReport = ({ base64, videoFile, mediaMode, address, socialConsent, xHandle }) => {
  const hasMedia = mediaMode === 'video' ? !!videoFile : !!base64;
  if (!hasMedia) return { ok: false, message: MESSAGES.noMedia };

  const addr = (address || '').trim();
  if (PLACEHOLDER_ADDRESSES.includes(addr.toLowerCase())) {
    return { ok: false, message: MESSAGES.noLocation };
  }

  if (socialConsent === 'tag' && !isValidHandle(xHandle)) {
    return { ok: false, message: MESSAGES.badHandle };
  }

  return { ok: true, message: '' };
};
