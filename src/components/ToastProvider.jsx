import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import Toast from './Toast';

// App-wide toast feedback. Any screen calls useToast() and fires a one-liner;
// the toast renders above the router so it survives navigation for its duration.
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { id, message, type, duration }

  const show = useCallback((message, type = 'info', duration = 3000) => {
    if (!message) return;
    // New id restarts the Toast timer even if the message repeats.
    setToast({ id: Date.now() + Math.random(), message, type, duration });
  }, []);

  const api = useMemo(() => ({
    show,
    success: (m, d) => show(m, 'success', d),
    error:   (m, d) => show(m, 'error', d),
    info:    (m, d) => show(m, 'info', d),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type}
          duration={toast.duration} onClose={() => setToast(null)} />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
