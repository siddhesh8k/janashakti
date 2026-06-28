import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Auto-recover from stale-deploy chunk errors that bypass React (Vite preload failures,
// async import() rejections): reload ONCE to fetch the fresh index + current chunks.
const RELOAD_KEY = 'js-chunk-reloaded';
const CHUNK_ERROR = /valid JavaScript MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i;
const recoverOnce = () => {
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
};
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recoverOnce(); });
window.addEventListener('error', (e) => { if (CHUNK_ERROR.test(e?.message || '')) recoverOnce(); });
window.addEventListener('unhandledrejection', (e) => {
  if (CHUNK_ERROR.test(e?.reason?.message || String(e?.reason || ''))) recoverOnce();
});
// If the app runs cleanly for a bit, the reload fixed it — reset the guard so a future
// deploy can recover again (and so we never loop within a single broken session).
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 10000));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
