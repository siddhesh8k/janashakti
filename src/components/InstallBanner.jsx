import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const timer = setTimeout(() => {
      if (deferredPrompt) setShow(true);
    }, 30000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

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
