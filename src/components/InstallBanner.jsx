import { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, ChevronRight, CheckCircle, Compass } from 'lucide-react';

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOSDevice = () =>
  /iphone|ipad|ipod/i.test(UA) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Only Safari exposes the Share → Add to Home Screen action; in-app/other iOS browsers don't.
const isIOSSafari = () => isIOSDevice() && /safari/i.test(UA) && !/crios|fxios|edgios|chrome|android/i.test(UA);
const isStandalone = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
  (typeof navigator !== 'undefined' && navigator.standalone === true);

export default function InstallBanner() {
  const [show, setShow] = useState(false);          // Android/desktop (beforeinstallprompt) banner
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [iosHint, setIosHint] = useState(false);    // iOS bottom banner
  const [iosGuide, setIosGuide] = useState(false);  // iOS step-by-step modal

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const timer = setTimeout(() => {
      if (deferredPrompt) setShow(true);
    }, 30000);

    // iOS never fires beforeinstallprompt — guide the MANUAL install flow instead
    // (once, dismissible, remembered so we don't nag every visit). Shown for any iOS
    // browser: Safari gets the Share steps; others are told to open in Safari first.
    let iosTimer;
    let dismissed = false;
    try { dismissed = localStorage.getItem('ios-install-dismissed') === '1'; } catch { /* private mode */ }
    if (isIOSDevice() && !isStandalone() && !dismissed) {
      iosTimer = setTimeout(() => setIosHint(true), 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
      clearTimeout(iosTimer);
    };
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const dismissIos = () => {
    setIosHint(false);
    setIosGuide(false);
    try { localStorage.setItem('ios-install-dismissed', '1'); } catch { /* private mode */ }
  };

  const safari = isIOSSafari();
  // Steps adapt to the browser: Safari can add directly; other iOS browsers must open in Safari first.
  const steps = safari
    ? [
        { icon: Share, title: 'Tap the Share button', body: "It's in Safari's toolbar — the square with an up-arrow (bottom of the screen on iPhone, top on iPad)." },
        { icon: PlusSquare, title: 'Choose "Add to Home Screen"', body: 'Scroll down the share sheet and tap it.' },
        { icon: CheckCircle, title: 'Tap "Add"', body: 'JanaShakti appears on your Home Screen and opens full-screen like an app.' },
      ]
    : [
        { icon: Compass, title: 'Open this page in Safari', body: 'iOS only lets you install web apps from Safari — copy the link or tap ••• → Open in Safari.' },
        { icon: Share, title: 'Tap the Share button', body: "In Safari, tap the square-with-up-arrow in the toolbar." },
        { icon: PlusSquare, title: 'Choose "Add to Home Screen"', body: 'Scroll down the share sheet, tap it, then tap "Add".' },
      ];

  // ── iOS step-by-step guide (opened from the banner) ──
  if (iosGuide) {
    return (
      <div
        onClick={dismissIos}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(4, 9, 26, 0.72)',
          zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: '460px', backgroundColor: '#0d1b2e',
            borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
            border: '0.5px solid #1a2f4a', borderBottom: 'none',
            padding: '20px 18px calc(24px + env(safe-area-inset-bottom, 0px))',
            animation: 'slideUp 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
                backgroundColor: '#00d4ff1a', border: '0.5px solid #00d4ff40',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Smartphone size={17} color="#00d4ff" strokeWidth={1.6} />
              </div>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#f0f6ff' }}>Add to Home Screen</span>
            </div>
            <button onClick={dismissIos} aria-label="Close" style={{
              background: '#112035', border: '0.5px solid #1a2f4a', borderRadius: '8px',
              cursor: 'pointer', padding: '7px', display: 'flex', flexShrink: 0,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={18} color="#94a3b8" strokeWidth={1.5} />
            </button>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, margin: '2px 0 16px 41px' }}>
            Install JanaShakti for a full-screen, app-like experience — no app store needed.
          </p>

          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: i === steps.length - 1 ? '20px' : '14px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '10px',
                    backgroundColor: '#112035', border: '0.5px solid #1a2f4a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={17} color="#00d4ff" strokeWidth={1.6} />
                  </div>
                  <span style={{
                    position: 'absolute', top: '-6px', left: '-6px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    backgroundColor: '#00d4ff', color: '#04091a',
                    fontSize: '10px', fontWeight: '800',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: '1px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>{s.title}</div>
                  <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.45 }}>{s.body}</div>
                </div>
              </div>
            );
          })}

          <button onClick={dismissIos} style={{
            width: '100%', backgroundColor: '#00d4ff', color: '#04091a', border: 'none',
            borderRadius: '10px', padding: '13px', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
          }}>Got it</button>
        </div>
      </div>
    );
  }

  // ── iOS bottom banner — tappable, opens the guide above ──
  if (iosHint) {
    return (
      <div style={{
        position: 'fixed', bottom: '80px', left: '50%',
        transform: 'translateX(-50%)', width: '90%', maxWidth: '440px',
        backgroundColor: '#0d1b2e', border: '0.5px solid #00d4ff',
        borderRadius: '12px', display: 'flex', alignItems: 'stretch',
        zIndex: 150, animation: 'slideUp 0.3s ease', overflow: 'hidden',
      }}>
        <button onClick={() => setIosGuide(true)} style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          padding: '12px 6px 12px 16px',
        }}>
          <Share size={18} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '13px', color: '#f0f6ff', fontWeight: '600' }}>
              Add JanaShakti to your Home Screen
            </span>
            <span style={{ display: 'block', fontSize: '11px', color: '#00d4ff', fontWeight: '500' }}>
              Tap to see how
            </span>
          </span>
          <ChevronRight size={16} color="#7689a3" strokeWidth={1.5} style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </button>
        <button onClick={dismissIos} aria-label="Dismiss" style={{
          background: '#112035', borderLeft: '0.5px solid #1a2f4a', border: 'none',
          cursor: 'pointer', padding: '0 14px', display: 'flex', flexShrink: 0,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={18} color="#94a3b8" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  if (!show) return null;

  // ── Android / desktop — real beforeinstallprompt install ──
  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)', width: '90%', maxWidth: '440px',
      backgroundColor: '#0d1b2e', border: '0.5px solid #00d4ff',
      borderRadius: '12px', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      zIndex: 150, animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Download size={18} color="#00d4ff" strokeWidth={1.5} />
        <span style={{ fontSize: '13px', color: '#f0f6ff', fontWeight: '500' }}>
          Install JanaShakti on your phone
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleInstall} style={{
          backgroundColor: '#00d4ff', color: '#04091a', border: 'none',
          borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
          fontWeight: '600', cursor: 'pointer',
        }}>Install</button>
        <button onClick={() => setShow(false)} aria-label="Dismiss" style={{
          background: '#112035', border: '0.5px solid #1a2f4a', borderRadius: '8px',
          cursor: 'pointer', padding: '7px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={18} color="#94a3b8" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
