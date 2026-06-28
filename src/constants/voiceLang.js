// Voice-assistant languages — English + Hindi. Each entry drives:
//   - stt:       Web Speech API recognition locale (SpeechRecognition.lang)
//   - ttsLangs:  ordered TTS voice preferences (first match wins; falls back down
//                the list)
//   - geminiName: the language Gemini is told to answer in
//   - suggested:  starter questions shown in that language
//   - ui:        every visible string in the panel, localized
// Adding a state language later = one more entry here (no component changes).

export const VOICE_LANGS = [
  {
    code: 'en',
    label: 'English',
    geminiName: 'English',
    stt: 'en-IN',
    ttsLangs: ['en-IN', 'en-GB', 'en-US'],
    suggested: [
      'Who is my representative?',
      'Issues near me?',
      'How many issues are open?',
      "What's the resolution rate?",
      'Which city has most problems?',
    ],
    ui: {
      subtitle: 'Ask about civic data',
      placeholder: 'Type a question…',
      listening: 'Listening…',
      analyzing: 'Analyzing civic data…',
      speaking: 'Speaking — tap the mic to stop',
      privacy: 'Voice processed on-device. No audio stored.',
      noSpeech: 'No speech detected. Try again.',
      cantHear: 'Could not hear you — try again or type below.',
      notSupported: 'Voice input isn’t supported in this browser — type your question below.',
      fallbackAnswer: 'Sorry, I could not find an answer right now. Please try again.',
      errorAnswer: 'Sorry, something went wrong. Please try again.',
    },
  },
  {
    code: 'hi',
    label: 'हिंदी',
    geminiName: 'Hindi',
    stt: 'hi-IN',
    ttsLangs: ['hi-IN'],
    suggested: [
      'मेरा प्रतिनिधि कौन है?',
      'मेरे आस-पास के मुद्दे?',
      'कितने मुद्दे खुले हैं?',
      'समाधान दर क्या है?',
      'किस शहर में सबसे ज़्यादा समस्याएँ हैं?',
    ],
    ui: {
      subtitle: 'नागरिक डेटा के बारे में पूछें',
      placeholder: 'प्रश्न लिखें…',
      listening: 'सुन रहा हूँ…',
      analyzing: 'डेटा का विश्लेषण हो रहा है…',
      speaking: 'बोल रहा हूँ — रोकने के लिए माइक दबाएँ',
      privacy: 'आवाज़ डिवाइस पर ही प्रोसेस होती है। कोई ऑडियो सेव नहीं होता।',
      noSpeech: 'कोई आवाज़ नहीं सुनाई दी। फिर से कोशिश करें।',
      cantHear: 'सुनाई नहीं दिया — फिर से बोलें या नीचे लिखें।',
      notSupported: 'यह ब्राउज़र वॉइस इनपुट को सपोर्ट नहीं करता — नीचे लिखकर पूछें।',
      fallbackAnswer: 'क्षमा करें, अभी उत्तर नहीं मिल पाया। कृपया फिर से प्रयास करें।',
      errorAnswer: 'क्षमा करें, कुछ गड़बड़ हो गई। कृपया फिर से प्रयास करें।',
    },
  },
];

export const VOICE_LANG_MAP = Object.fromEntries(VOICE_LANGS.map((l) => [l.code, l]));
export const DEFAULT_VOICE_LANG = 'en';
