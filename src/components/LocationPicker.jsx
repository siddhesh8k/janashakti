import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMaps } from '../utils/googleMaps';
import { reverseGeocode } from '../utils/geocode';
import { DARK_MAP_STYLE } from '../constants/mapStyle';

// Small draggable-pin map. Lets the user correct the issue location.
// onChange(latlng, address) fires after a drag or tap (address reverse-geocoded).
export default function LocationPicker({ value, onChange }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Initialize map once.
  useEffect(() => {
    let cancelled = false;
    const center = value || { lat: 12.9716, lng: 77.5946 };

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) return;
        const map = new maps.Map(mapRef.current, {
          center, zoom: 18,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        });
        const marker = new maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: maps.Animation.DROP,
        });
        mapInstanceRef.current = map;
        markerRef.current = marker;

        const commit = async (latLng) => {
          const lat = latLng.lat();
          const lng = latLng.lng();
          const address = await reverseGeocode(lat, lng);
          onChangeRef.current?.({ lat, lng }, address);
        };

        marker.addListener('dragend', (e) => commit(e.latLng));
        map.addListener('click', (e) => {
          marker.setPosition(e.latLng);
          commit(e.latLng);
        });
      })
      .catch((err) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker/map in sync when value changes from outside (e.g. geolocation resolves).
  useEffect(() => {
    if (!value || !mapInstanceRef.current || !markerRef.current) return;
    markerRef.current.setPosition(value);
    mapInstanceRef.current.setCenter(value);
  }, [value]);

  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '12px', backgroundColor: '#112035',
        borderRadius: '10px', border: '0.5px solid #1a2f4a',
      }}>
        <MapPin size={14} color="#f97316" strokeWidth={1.5} />
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          Map unavailable — edit the address above manually.
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapRef} style={{
        width: '100%', height: '180px', borderRadius: '10px',
        overflow: 'hidden', border: '0.5px solid #1a2f4a',
      }} />
      <div style={{
        position: 'absolute', bottom: '8px', left: '8px',
        backgroundColor: '#04091acc', backdropFilter: 'blur(8px)',
        borderRadius: '8px', padding: '4px 10px',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
        <MapPin size={12} color="#16a34a" strokeWidth={1.5} />
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
          Drag the pin or tap to set location
        </span>
      </div>
    </div>
  );
}
