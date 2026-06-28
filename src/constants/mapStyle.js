// Dark map theme derived from the JanaShakti logo palette.
// Shared by MapScreen and LocationPicker.
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a6280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#04091a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2f4a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#04091a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];
