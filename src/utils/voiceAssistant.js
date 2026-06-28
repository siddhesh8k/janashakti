import { callGeminiPlainText } from './gemini';
import { fetchCivicContext } from './civicDataContext';

// Privacy: the browser's Web Speech API does speech-to-text locally — no audio leaves
// the device. Only the transcribed TEXT + AGGREGATE civic stats reach Gemini.

// Ask Gemini a civic question with the live data as context. `lang` is a VOICE_LANGS
// entry — Gemini replies in lang.geminiName and localized fallbacks are used on error.
// `userLocation` ({ lat, lng, locationText }) enables location-aware "near me" answers.
// Returns spoken-style plain text. Routes through gemini.js → fetchAI (provider switch
// + model chain). Never throws. (The data context caches its raw reads internally.)
export const askGeminiRaw = async (question, lang, userLocation) => {
  const langName = lang?.geminiName || 'English';
  const fallbackAnswer = lang?.ui?.fallbackAnswer || 'Sorry, I could not find an answer right now. Please try again.';
  const errorAnswer = lang?.ui?.errorAnswer || 'Sorry, something went wrong. Please try again.';
  try {
    const { context } = await fetchCivicContext(userLocation);
    const prompt = `You are JanaShakti AI Assistant — a helpful civic-intelligence voice assistant for India's civic issue reporting platform.

You have access to live data from the JanaShakti database:

${context}

USER'S QUESTION: "${question}"

RULES:
- Answer concisely in 2-3 sentences maximum (this will be spoken aloud).
- Use specific numbers from the data above; keep numbers as digits.
- If asked about something not in the data, say so honestly.
- Be conversational and friendly.
- If the question is about a specific city or issue type, filter your answer to that.
- If the user asks about "near me", "around me", "my area", or "nearby", use the NEAR YOU section (their live GPS location). If there is no NEAR YOU section, tell them their location isn't available yet.
- If the user asks who is responsible for their area, who their representative/corporator/MLA is, who "received" the issues in their area, or how their representative is performing, use YOUR ELECTED REPRESENTATIVE (in NEAR YOU) and the ELECTED REPRESENTATIVE ACCOUNTABILITY section. State the representative's name, ward, and resolution rate factually. Stay strictly neutral — party is only a label; give no opinions, endorsements, or voting advice.
- End with a brief actionable insight when relevant.
- Do NOT use markdown, bullet points, or formatting — plain spoken text only.
- Do NOT reveal user IDs, emails, or any personal data.
- IMPORTANT: Write your ENTIRE answer ONLY in ${langName}, in natural everyday ${langName}.

Respond with ONLY the answer text, no JSON, no quotes.`;

    const text = await callGeminiPlainText(prompt);
    const clean = (text == null ? '' : String(text)).replace(/^["']|["']$/g, '').trim();
    return clean || fallbackAnswer;
  } catch (err) {
    console.error('[VoiceAssistant]:', err);
    return errorAnswer;
  }
};

// Text-to-speech via the browser's SpeechSynthesis API. `ttsLangs` is an ordered list
// of preferred locales (e.g. ['mr-IN', 'hi-IN']) — the first available voice wins.
export const speak = (text, onEnd, ttsLangs = ['en-IN']) => {
  if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.lang = ttsLangs[0]; // hint the locale even when no exact voice is installed

  const voices = window.speechSynthesis.getVoices();
  let preferred = null;
  for (const code of ttsLangs) {
    const base = code.split('-')[0].toLowerCase();
    preferred =
      voices.find((v) => v.lang.replace('_', '-') === code) ||
      voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
    if (preferred) break;
  }
  if (preferred) { utterance.voice = preferred; utterance.lang = preferred.lang; }

  utterance.onend = () => { if (onEnd) onEnd(); };
  utterance.onerror = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.speak(utterance);
};

export const stopSpeaking = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};
