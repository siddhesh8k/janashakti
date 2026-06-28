// Generates a human-friendly complaint reference like "JS-BLR-2026-00042".
// Note: the trailing number is a pseudo-sequence derived from the timestamp —
// there is no global counter document, which is fine for a demo. For a true
// monotonic sequence you'd use a Firestore transaction on a counter doc.
const CITY_CODES = {
  Bangalore: 'BLR',
  Bengaluru: 'BLR',
  Mumbai: 'MUM',
  Delhi: 'DEL',
  'New Delhi': 'DEL',
  Chennai: 'CHN',
  Hyderabad: 'HYD',
  Pune: 'PNE',
  Other: 'OTH',
};

const cityCode = (cityName) => {
  if (!cityName) return 'OTH';
  if (CITY_CODES[cityName]) return CITY_CODES[cityName];
  return cityName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'OTH';
};

export function generateComplaintId(cityName) {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `JS-${cityCode(cityName)}-${year}-${seq}`;
}
