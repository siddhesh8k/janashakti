// UN SDG mapping per issue type
export const ISSUE_SDG_MAP = {
  Pothole:         { sdgs:['SDG11','SDG3'],
                     names:['Sustainable Cities','Good Health'],
                     eMetric:'vehicle_emissions',
                     sMetric:'road_safety' },
  Streetlight:     { sdgs:['SDG7','SDG5','SDG11'],
                     names:['Clean Energy','Gender Equality','Safe Cities'],
                     eMetric:'energy_saved',
                     sMetric:'night_safety' },
  Garbage:         { sdgs:['SDG3','SDG11','SDG12'],
                     names:['Good Health','Sustainable Cities','Responsible Consumption'],
                     eMetric:'waste_managed',
                     sMetric:'disease_prevention' },
  'Water Leakage': { sdgs:['SDG6','SDG3','SDG11'],
                     names:['Clean Water','Good Health','Sustainable Cities'],
                     eMetric:'water_saved',
                     sMetric:'health_risk_eliminated' },
  Infrastructure:  { sdgs:['SDG9','SDG11'],
                     names:['Industry & Innovation','Sustainable Cities'],
                     eMetric:'infrastructure_quality',
                     sMetric:'accessibility' },
  Other:           { sdgs:['SDG11'],
                     names:['Sustainable Cities'],
                     eMetric:'general',
                     sMetric:'community_wellbeing' },
};

// SDG color map (official UN colors)
export const SDG_COLORS = {
  SDG3:  '#4C9F38',
  SDG5:  '#FF3A21',
  SDG6:  '#26BDE2',
  SDG7:  '#FCC30B',
  SDG9:  '#FD6925',
  SDG10: '#DD1367',
  SDG11: '#FD9D24',
  SDG12: '#BF8B2E',
  SDG15: '#56C02B',
  SDG16: '#00689D',
  SDG17: '#19486A',
};

// ESG score weights
export const ESG_WEIGHTS = {
  E: 0.35,  // Environmental
  S: 0.35,  // Social
  G: 0.30,  // Governance
};

// Estimated impact metrics per issue type (on resolution)
export const IMPACT_ESTIMATES = {
  'Water Leakage': {
    eValue: 45000, eUnit: 'litres/month',
    sValue: 340,   sUnit: 'households benefited',
  },
  Garbage: {
    eValue: 2.4,   eUnit: 'tonnes addressed',
    sValue: 500,   sUnit: 'people health risk reduced',
  },
  Streetlight: {
    eValue: 120,   eUnit: 'kWh/month saved (LED)',
    sValue: 1200,  sUnit: 'people safer at night',
  },
  Pothole: {
    eValue: 0.8,   eUnit: 'tonnes CO2/month saved',
    sValue: 2400,  sUnit: 'vehicles protected daily',
  },
  Infrastructure: {
    eValue: 0,     eUnit: 'general improvement',
    sValue: 800,   sUnit: 'people impacted',
  },
  Other: {
    eValue: 0,     eUnit: 'general improvement',
    sValue: 200,   sUnit: 'people impacted',
  },
};

// City ESG grade thresholds
export const ESG_GRADES = [
  { min: 9.0, grade: 'A+', color: '#16a34a' },
  { min: 8.0, grade: 'A',  color: '#22c55e' },
  { min: 7.0, grade: 'B+', color: '#00d4ff' },
  { min: 6.0, grade: 'B',  color: '#3b82f6' },
  { min: 5.0, grade: 'C',  color: '#eab308' },
  { min: 0,   grade: 'D',  color: '#ef4444' },
];

// New ESG badges
export const ESG_BADGES = [
  { id:'water_warrior',   name:'Water Warrior',
    icon:'Droplets', color:'#26BDE2',
    condition: p => (p.issuesByType?.['Water Leakage'] || 0) >= 3 },
  { id:'green_guardian',  name:'Green Guardian',
    icon:'Leaf', color:'#4C9F38',
    condition: p => (p.esgIssuesResolved || 0) >= 5 },
  { id:'justice_seeker',  name:'Justice Seeker',
    icon:'Scale', color:'#00689D',
    condition: p => (p.rtiFiled || 0) >= 1 },
  { id:'social_champion', name:'Social Champion',
    icon:'Users', color:'#DD1367',
    condition: p => (p.totalPeopleImpacted || 0) >= 100 },
  { id:'sdg_contributor', name:'SDG Contributor',
    icon:'Target', color:'#FD9D24',
    condition: p => (p.sdgsContributed || []).length >= 3 },
];
