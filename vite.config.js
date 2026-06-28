import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Lets Firebase Auth's signInWithPopup poll popup.closed without the browser's
  // Cross-Origin-Opener-Policy warning. Applies to dev server + vite preview.
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,  // purge precaches from previous deploys
        clientsClaim: true,           // new SW controls open pages immediately
        skipWaiting: true,            // activate the new SW without waiting
        runtimeCaching: [{
          urlPattern: /^https:\/\/firestore\.googleapis\.com/,
          handler: 'NetworkFirst',
        }],
      },
    }),
  ],
  // Vitest config. `include` covers BOTH the existing src tests and the new tests/ tree
  // (hand-written core + AI-generated under tests/ai). The default `npm test` script
  // narrows to the deterministic set via positional args; `test:ai` / `test:analyze`
  // run the AI tests.
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    include: ['src/**/*.test.{js,jsx}', 'tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', '**/*.test.{js,jsx}'],
    },
  },
});
