import { createContext, useContext, useEffect, useRef } from 'react';
import { useGeoLocation } from '../hooks/useLocation';
import { loadGoogleMaps } from '../utils/googleMaps';
import { loadOrganizations } from '../utils/organizations';
import { loadRepresentatives } from '../utils/representatives';
import { fetchCivicContext } from '../utils/civicDataContext';

// One geolocation watch for the whole app (instead of each screen starting its own),
// plus a background prewarm of the heavy caches on load — so Map / Leaderboard / voice
// assistant open against warm data instead of fetching on first navigation.
const LocationContext = createContext({ location: null, locationText: 'Detecting...', accuracy: null, error: null });

export function LocationProvider({ children }) {
  const geo = useGeoLocation(); // the single source of truth for GPS
  const warmedStatic = useRef(false);
  const warmedCivic = useRef(false);

  // Static caches don't need a location — warm them immediately on mount.
  useEffect(() => {
    if (warmedStatic.current) return;
    warmedStatic.current = true;
    loadGoogleMaps().catch(() => {});       // map script (also used by LocationPicker)
    loadOrganizations().catch(() => {});    // adopted-zone orgs (map + leaderboard)
    loadRepresentatives().catch(() => {});  // OGD ward/representative data
  }, []);

  // Civic context (issues + nearby + representative) needs a location — warm it once a
  // fix arrives, so the voice assistant's first question answers instantly.
  useEffect(() => {
    if (warmedCivic.current || !geo.location) return;
    warmedCivic.current = true;
    fetchCivicContext({
      lat: geo.location.lat,
      lng: geo.location.lng,
      locationText: geo.locationText,
    }).catch(() => {});
  }, [geo.location, geo.locationText]);

  return (
    <LocationContext.Provider value={geo}>
      {children}
    </LocationContext.Provider>
  );
}

// Shared location hook — same shape as useGeoLocation ({ location, locationText,
// accuracy, error }) so consumers swap one for the other with no other changes.
export function useSharedLocation() {
  return useContext(LocationContext);
}
