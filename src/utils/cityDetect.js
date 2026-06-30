import { CITIES } from '../constants/cities';

// Address substrings → canonical city value (from constants/cities CITIES). Covers
// common alternate names and adjacent municipalities so a free-text address still maps
// to the right city. Add a city to CITIES (+ an alias row here) and detection picks it up.
const CITY_ALIASES = {
  Bangalore: ['bangalore', 'bengaluru', 'bengalūru'],
  Mumbai: ['mumbai', 'bombay', 'navi mumbai', 'thane'],
  Delhi: ['new delhi', 'delhi', 'noida', 'gurugram', 'gurgaon'],
  Chennai: ['chennai', 'madras'],
  Hyderabad: ['hyderabad', 'secunderabad'],
  Pune: ['pune', 'poona', 'pimpri', 'chinchwad'],
};

// Best-effort city tag from a free-text address. Returns a CITIES `value` or 'Other'.
// Case-insensitive substring match; first city (in CITIES order) with a hit wins.
export const detectCity = (address) => {
  const a = (address || '').toLowerCase();
  if (!a) return 'Other';
  for (const city of CITIES) {
    if (city.value === 'Other') continue;
    const aliases = CITY_ALIASES[city.value] || [city.value.toLowerCase()];
    if (aliases.some((alias) => a.includes(alias))) return city.value;
  }
  return 'Other';
};
