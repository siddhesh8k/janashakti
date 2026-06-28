// Reverse geocoding via Google Maps Geocoding REST API.
// Shared by useGeoLocation and LocationPicker.
export async function reverseGeocode(lat, lng) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (!key || key === 'your_google_maps_key_here') return fallback;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`
    );
    const data = await res.json();
    return data.results?.[0]?.formatted_address || fallback;
  } catch {
    return fallback;
  }
}

// Forward geocoding (address string → { lat, lng }). Used when a user manually adds
// an organization by typing its address. Returns null if it can't be resolved.
export async function forwardGeocode(address) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key || key === 'your_google_maps_key_here' || !address?.trim()) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
    );
    const data = await res.json();
    const loc = data.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}
