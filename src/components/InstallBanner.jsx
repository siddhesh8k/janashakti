import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

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
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const timer = setTimeout(() => {
      if (deferredPrompt) setShow(true);
    }, 30000);

    // iOS Safari never fires beforeinstallprompt — guide the manual install flow instead
    // (once, dismissible, remembered so we don't nag every visit).
    let iosTimer;
    let dismissed = false;
    try { dismissed = localStorage.getItem('ios-install-dismissed') === '1'; } catch { /* private mode */ }
    if (isIOSSafari() && !isStandalone() && !dismissed) {
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
    try { localStorage.setItem('ios-install-dismissed', '1'); } catch { /* private mode */ }
  };

  // iOS Safari hint — no Install button (iOS can't be prompted programmatically).
  if (iosHint) {
    return (
      <div style={{
        position: 'fixed', bottom: '80px', left: '50%',
        transform: 'translateX(-50%)', width: '90%', maxWidth: '440px',
        backgroundColor: '#0d1b2e', border: '0.5px solid #00d4ff',
        borderRadius: '12px', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        zIndex: 150, animation: 'slideUp 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Share size={18} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#f0f6ff', fontWeight: '500', lineHeight: 1.4 }}>
            Install JanaShakti: tap <span style={{ color: '#00d4ff', fontWeight: '600' }}>Share</span>, then{' '}
            <span style={{ color: '#00d4ff', fontWeight: '600' }}>Add to Home Screen</span>
          </span>
        </div>
        <button onClick={dismissIos} aria-label="Dismiss" style={{
          background: '#112035', border: '0.5px solid #1a2f4a', borderRadius: '8px',
          cursor: 'pointer', padding: '7px', display: 'flex', flexShrink: 0,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={18} color="#94a3b8" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  if (!show) return null;

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
