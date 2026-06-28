// Single-load Google Maps JavaScript API.
// Both MapScreen and LocationPicker share one <script> tag via this promise.
let loadPromise = null;

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key || key === 'your_google_maps_key_here') {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_KEY is missing in .env'));
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__gMapsCb = () => resolve(window.google.maps);
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      // Script already injected elsewhere — wait for google to appear.
      const check = setInterval(() => {
        if (window.google?.maps) { clearInterval(check); resolve(window.google.maps); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__gMapsCb&loading=async`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps — check that Maps JavaScript API is enabled and billing is active.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
