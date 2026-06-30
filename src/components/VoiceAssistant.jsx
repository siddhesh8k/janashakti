import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, MicOff, Volume2, Bot, X, Loader, Send, Lock } from 'lucide-react';
import { askGeminiRaw, speak, stopSpeaking } from '../utils/voiceAssistant';
import { VOICE_LANGS, VOICE_LANG_MAP, DEFAULT_VOICE_LANG } from '../constants/voiceLang';
import { useSharedLocation } from './LocationProvider';

// Keep the floating UI anchored to the app's 480px centred column (not the viewport
// edge) on wide screens; on phones it collapses to 16px.
const RIGHT = 'max(16px, calc(50vw - 240px + 16px))';
const PANEL_WIDTH = 'min(340px, calc(100vw - 32px))';
const LANG_KEY = 'js_voice_lang';

// Routes that hide the bottom nav (mirrors App.jsx HIDE_NAV_ROUTES). On these screens
// there's no 64px nav strip, so the floating button drops to the bottom edge.
const HIDE_NAV_ROUTES = ['/onboarding', '/issue', '/analytics', '/authority', '/agents', '/leaderboard', '/journalist', '/notifications'];

export default function VoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | listening | processing | speaking | error
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) || DEFAULT_VOICE_LANG; }
    catch { return DEFAULT_VOICE_LANG; }
  });

  const L = VOICE_LANG_MAP[lang] || VOICE_LANG_MAP[DEFAULT_VOICE_LANG];

  // Drop the button/panel to the bottom edge on screens without the bottom nav strip.
  const { pathname } = useLocation();
  const navHidden = HIDE_NAV_ROUTES.some((r) => pathname.startsWith(r));
  const fabBottom = navHidden ? '24px' : '80px';
  const panelBottom = navHidden ? '32px' : '88px';

  // Live GPS — enables "issues near me" answers. Kept in a ref so the (re-created)
  // speech-recognition callbacks always read the freshest fix.
  const { location, locationText } = useSharedLocation();
  const userLocationRef = useRef(null);
  useEffect(() => {
    userLocationRef.current = location
      ? { lat: location.lat, lng: location.lng, locationText }
      : null;
  }, [location, locationText]);

  const recognitionRef = useRef(null);
  const gotResultRef = useRef(false);
  const scrollRef = useRef(null);

  // Tidy up the mic + any speech on unmount.
  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    stopSpeaking();
  }, []);

  // Auto-scroll the chat to the latest exchange.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, state]);

  const handleQuestion = async (question) => {
    if (!question) return;
    setTranscript(question);
    setError('');
    setState('processing');
    const response = await askGeminiRaw(question, L, userLocationRef.current); // never throws — returns a fallback string
    setAnswer(response);
    setHistory((prev) => [...prev.slice(-4), { question, answer: response }]);
    setState('speaking');
    speak(response, () => setState('idle'), L.ttsLangs);
  };

  // Switch language: persist, stop any in-flight speech, and reset to idle.
  const changeLang = (code) => {
    setLang(code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* noop */ }
    stopSpeaking();
    setState((s) => (s === 'speaking' ? 'idle' : s));
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(L.ui.notSupported);
      return;
    }
    const recognition = new SR();
    recognition.lang = L.stt;
    recognition.interimResults = true;
    recognition.continuous = false;
    gotResultRef.current = false;

    recognition.onstart = () => { setError(''); setTranscript(''); setState('listening'); };
    recognition.onresult = (event) => {
      const current = event.results[event.results.length - 1];
      const text = current[0].transcript;
      setTranscript(text);
      if (current.isFinal) { gotResultRef.current = true; handleQuestion(text); }
    };
    recognition.onerror = (event) => {
      setError(event.error === 'no-speech' ? L.ui.noSpeech : L.ui.cantHear);
      setState('idle');
    };
    recognition.onend = () => { if (!gotResultRef.current) setState('idle'); };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* already running */ }
  };

  // The mic button: start/stop listening, or stop speaking.
  const micAction = () => {
    if (state === 'listening') { recognitionRef.current?.stop(); return; }
    if (state === 'speaking') { stopSpeaking(); setState('idle'); return; }
    if (state === 'processing') return;
    startListening();
  };

  const onFabClick = () => {
    if (!isOpen) { setIsOpen(true); return; }
    micAction();
  };

  const submitText = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    stopSpeaking();
    handleQuestion(q);
  };

  const closePanel = () => {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    stopSpeaking();
    setState('idle');
    setIsOpen(false);
  };

  const FabIcon = state === 'listening' ? MicOff
    : state === 'processing' ? Loader
    : state === 'speaking' ? Volume2
    : Mic;

  return (
    <>
      {/* Expanded panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: panelBottom, right: RIGHT, width: PANEL_WIDTH, zIndex: 100,
          backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '16px', animation: 'popIn 0.2s ease',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="#00d4ff" strokeWidth={1.5} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#00d4ff' }}>JanaShakti AI</div>
                <div style={{ fontSize: '11px', color: '#7689a3' }}>{L.ui.subtitle}</div>
              </div>
            </div>
            <button onClick={closePanel} aria-label="Close" style={{
              background: 'none', border: 'none', color: '#7689a3', cursor: 'pointer', padding: '2px',
            }}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Language selector */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {VOICE_LANGS.map((opt) => {
              const active = opt.code === lang;
              return (
                <button key={opt.code} onClick={() => changeLang(opt.code)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '11px', fontWeight: '600',
                  backgroundColor: active ? '#00d4ff' : '#112035',
                  color: active ? '#04091a' : '#94a3b8',
                  border: active ? 'none' : '0.5px solid #1a2f4a',
                }}>{opt.label}</button>
              );
            })}
          </div>

          {/* Chat history */}
          {history.length > 0 && (
            <div ref={scrollRef} style={{
              maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column',
              gap: '8px', marginBottom: '12px',
            }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#00d4ff15',
                    color: '#f0f6ff', fontSize: '12px', lineHeight: 1.4,
                    borderRadius: '12px 12px 4px 12px', padding: '8px 10px',
                  }}>{h.question}</div>
                  <div style={{
                    alignSelf: 'flex-start', maxWidth: '90%',
                    backgroundColor: '#112035', color: '#94a3b8', fontSize: '12px', lineHeight: 1.5,
                    borderRadius: '12px 12px 12px 4px', padding: '8px 10px',
                  }}>{h.answer}</div>
                </div>
              ))}
            </div>
          )}

          {/* Live state line */}
          {state === 'listening' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444',
                             animation: 'pulse 1s infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                {transcript || L.ui.listening}
              </span>
            </div>
          )}
          {state === 'processing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Loader size={14} color="#00d4ff" strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{L.ui.analyzing}</span>
            </div>
          )}
          {state === 'speaking' && answer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Volume2 size={14} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0, animation: 'pulse 1.2s infinite' }} />
              <span style={{ fontSize: '11px', color: '#7689a3' }}>{L.ui.speaking}</span>
            </div>
          )}
          {error && (
            <div style={{ fontSize: '12px', color: '#f97316', marginBottom: '12px' }}>{error}</div>
          )}

          {/* Suggested questions (empty state) */}
          {history.length === 0 && state === 'idle' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {L.suggested.map((q) => (
                <button key={q} onClick={() => handleQuestion(q)} style={{
                  backgroundColor: '#112035', border: '0.5px solid #1a2f4a', borderRadius: '999px',
                  padding: '6px 12px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00d4ff'; e.currentTarget.style.color = '#00d4ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1a2f4a'; e.currentTarget.style.color = '#94a3b8'; }}
                >{q}</button>
              ))}
            </div>
          )}

          {/* Mic + text input row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={micAction} aria-label="Ask by voice" style={{
              width: '40px', height: '40px', flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer',
              backgroundColor: state === 'listening' ? '#ef4444' : '#00d4ff', color: '#04091a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: state === 'listening' ? 'voicePulse 1.5s infinite' : 'none',
            }}>
              {state === 'processing'
                ? <Loader size={18} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />
                : state === 'listening' ? <MicOff size={18} strokeWidth={2} />
                : <Mic size={18} strokeWidth={2} />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitText(); }}
              placeholder={L.ui.placeholder}
              style={{
                flex: 1, minWidth: 0, backgroundColor: '#112035', color: '#f0f6ff',
                border: '0.5px solid #1a2f4a', borderRadius: '10px', padding: '10px 12px',
                fontSize: '13px', outline: 'none',
              }}
            />
            <button onClick={submitText} aria-label="Send" disabled={!input.trim()} style={{
              background: 'none', border: 'none', color: input.trim() ? '#00d4ff' : '#1a2f4a',
              cursor: input.trim() ? 'pointer' : 'default', padding: '4px', flexShrink: 0,
            }}>
              <Send size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Privacy note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px' }}>
            <Lock size={10} color="#7689a3" strokeWidth={1.5} />
            <span style={{ fontSize: '10px', color: '#7689a3' }}>{L.ui.privacy}</span>
          </div>
        </div>
      )}

      {/* Floating button — hidden while the panel is open (the panel has its own mic).
          Standard FAB spot: bottom-right, just above the bottom nav. The InstallBanner
          uses a higher z-index, so it overlays this and stays dismissible. */}
      {!isOpen && (
        <button onClick={onFabClick} aria-label="JanaShakti voice assistant" style={{
          position: 'fixed', bottom: fabBottom, right: RIGHT, zIndex: 90,
          width: '44px', height: '44px', borderRadius: '50%', border: 'none', cursor: 'pointer',
          backgroundColor: state === 'listening' ? '#ef4444' : '#00d4ff', color: '#04091a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,212,255,0.3)',
          animation: state === 'listening' ? 'voicePulse 1.5s infinite' : 'none',
        }}>
          <FabIcon size={20} strokeWidth={2}
            style={state === 'processing' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        </button>
      )}
    </>
  );
}
