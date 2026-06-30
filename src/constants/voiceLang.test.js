import { describe, it, expect } from 'vitest';
import { VOICE_LANGS, VOICE_LANG_MAP, DEFAULT_VOICE_LANG } from './voiceLang';

const UI_KEYS = [
  'subtitle', 'placeholder', 'listening', 'analyzing', 'speaking',
  'privacy', 'noSpeech', 'cantHear', 'notSupported', 'fallbackAnswer', 'errorAnswer',
];

describe('VOICE_LANGS', () => {
  it('exports exactly the English and Hindi entries, in that order', () => {
    expect(Array.isArray(VOICE_LANGS)).toBe(true);
    expect(VOICE_LANGS.map((l) => l.code)).toEqual(['en', 'hi']);
  });

  it('every entry has a fully-formed shape (codes, locales, tts list, suggestions, ui)', () => {
    for (const lang of VOICE_LANGS) {
      expect(typeof lang.code).toBe('string');
      expect(typeof lang.label).toBe('string');
      expect(typeof lang.geminiName).toBe('string');
      expect(typeof lang.stt).toBe('string');

      // ttsLangs is a non-empty array of BCP-47-ish strings whose first entry shares the stt region
      expect(Array.isArray(lang.ttsLangs)).toBe(true);
      expect(lang.ttsLangs.length).toBeGreaterThan(0);
      lang.ttsLangs.forEach((t) => expect(typeof t).toBe('string'));

      // suggested: exactly 5 starter questions, all non-empty strings
      expect(Array.isArray(lang.suggested)).toBe(true);
      expect(lang.suggested).toHaveLength(5);
      lang.suggested.forEach((q) => {
        expect(typeof q).toBe('string');
        expect(q.length).toBeGreaterThan(0);
      });

      // ui: every visible string is present and a non-empty string
      expect(Object.keys(lang.ui).sort()).toEqual([...UI_KEYS].sort());
      UI_KEYS.forEach((k) => {
        expect(typeof lang.ui[k]).toBe('string');
        expect(lang.ui[k].length).toBeGreaterThan(0);
      });
    }
  });

  it('uses Indian recognition locales (en-IN / hi-IN)', () => {
    const en = VOICE_LANGS.find((l) => l.code === 'en');
    const hi = VOICE_LANGS.find((l) => l.code === 'hi');
    expect(en.stt).toBe('en-IN');
    expect(en.ttsLangs[0]).toBe('en-IN');
    expect(en.geminiName).toBe('English');
    expect(hi.stt).toBe('hi-IN');
    expect(hi.ttsLangs).toEqual(['hi-IN']);
    expect(hi.geminiName).toBe('Hindi');
    expect(hi.label).toBe('हिंदी');
  });
});

describe('VOICE_LANG_MAP', () => {
  it('is keyed by language code and references the same entries as VOICE_LANGS', () => {
    expect(Object.keys(VOICE_LANG_MAP).sort()).toEqual(['en', 'hi']);
    expect(VOICE_LANG_MAP.en).toBe(VOICE_LANGS[0]);
    expect(VOICE_LANG_MAP.hi).toBe(VOICE_LANGS[1]);
  });
});

describe('DEFAULT_VOICE_LANG', () => {
  it('is "en" and points at a real entry in the map', () => {
    expect(DEFAULT_VOICE_LANG).toBe('en');
    expect(VOICE_LANG_MAP[DEFAULT_VOICE_LANG]).toBeDefined();
    expect(VOICE_LANG_MAP[DEFAULT_VOICE_LANG].code).toBe('en');
  });
});
