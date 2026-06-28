import { useState, useEffect, useRef } from 'react';
import { reverseGeocode } from '../utils/geocode';

// High-accuracy geolocation. Uses watchPosition so the GPS fix converges over a
// few seconds, and keeps only the most accurate reading — giving a pin-point
// location instead of the first (often coarse) cellular/wifi estimate.
export function useGeoLocation() {
  const [location, setLocation] = useState(null);
  const [locationText, setLocationText] = useState('Detecting...');
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const bestAccuracyRef = useRef(Infinity);
  const lastGeocodedRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLocationText('Location unavailable');
      setLocation({ lat: 20.5937, lng: 78.9629 });
      return;
    }

    const onFix = async (pos) => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      // Ignore readings that are less accurate than the best one so far.
      if (acc > bestAccuracyRef.current + 1) return;
      bestAccuracyRef.current = acc;
      setLocation({ lat, lng });
      setAccuracy(acc);

      // Only reverse-geocode when the point moved enough to matter (~30 m).
      const last = lastGeocodedRef.current;
      const moved = !last ||
        Math.abs(last.lat - lat) > 0.0003 || Math.abs(last.lng - lng) > 0.0003;
      if (moved) {
        lastGeocodedRef.current = { lat, lng };
        const address = await reverseGeocode(lat, lng);
        setLocationText(address);
      }
    };

    const onErr = (err) => {
      setError(err.message);
      if (bestAccuracyRef.current === Infinity) {
        setLocationText('Location not available');
        setLocation({ lat: 12.9716, lng: 77.5946 });
      }
    };

    const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    const watchId = navigator.geolocation.watchPosition(onFix, onErr, opts);

    // Stop refining after 20s to conserve battery — by then GPS has converged.
    const stop = setTimeout(() => navigator.geolocation.clearWatch(watchId), 20000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(stop);
    };
  }, []);

  return { location, locationText, accuracy, error };
}
