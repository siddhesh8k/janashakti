export const ISSUE_TYPES = [
  { value: 'Pothole',         label: 'Pothole',            color: '#f97316' },
  { value: 'Streetlight',     label: 'Broken Streetlight',  color: '#eab308' },
  { value: 'Garbage',         label: 'Garbage',             color: '#22c55e' },
  { value: 'Water Leakage',   label: 'Water Leakage',       color: '#3b82f6' },
  { value: 'Infrastructure',  label: 'Infrastructure',      color: '#8b5cf6' },
  { value: 'Traffic Signal',  label: 'Traffic Signal Not Working', color: '#ec4899' },
  // Extended civic categories (match the real dataset taxonomy).
  { value: 'Broken Road',                 label: 'Broken Road',                 color: '#f59e0b' },
  { value: 'Broken Streetlight',          label: 'Broken Streetlight',          color: '#eab308' },
  { value: 'Garbage Dumping',             label: 'Garbage Dumping',             color: '#22c55e' },
  { value: 'Open Manhole',                label: 'Open Manhole',                color: '#ef4444' },
  { value: 'Sewage Overflow',             label: 'Sewage Overflow',             color: '#0ea5e9' },
  { value: 'Water Logging',               label: 'Water Logging',               color: '#3b82f6' },
  { value: 'Water Supply Issue',          label: 'Water Supply Issue',          color: '#06b6d4' },
  { value: 'Air Pollution',               label: 'Air Pollution',               color: '#94a3b8' },
  { value: 'Noise Pollution',             label: 'Noise Pollution',             color: '#ec4899' },
  { value: 'Dangerous Tree',              label: 'Dangerous Tree',              color: '#16a34a' },
  { value: 'Footpath Encroachment',       label: 'Footpath Encroachment',       color: '#a855f7' },
  { value: 'Illegal Construction',        label: 'Illegal Construction',        color: '#8b5cf6' },
  { value: 'Stray Animal Menace',         label: 'Stray Animal Menace',         color: '#d97706' },
  { value: 'Traffic Signal Malfunction',  label: 'Traffic Signal Malfunction',  color: '#f43f5e' },
  { value: 'Other',           label: 'Other',               color: '#64748b' },
];

export const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

export const STATUS_PIPELINE = ['Reported', 'Verified', 'In Progress', 'Resolved'];

export const CIVIC_SCORE_POINTS = {
  REPORT_ISSUE:        10,
  VERIFY_ISSUE:         5,
  SHARE_ISSUE:          5,
  RETWEET_POST:        10,
  ISSUE_RESOLVED:      25,
  DAILY_STREAK:         2,
};

export const LEVEL_THRESHOLDS = [
  { min: 0,   max: 50,        name: 'Newcomer',       icon: 'Sprout'  },
  { min: 51,  max: 150,       name: 'Reporter',       icon: 'Eye'     },
  { min: 151, max: 300,       name: 'Guardian',        icon: 'Shield'  },
  { min: 301, max: 500,       name: 'Local Hero',      icon: 'Star'    },
  { min: 501, max: Infinity,  name: 'City Guardian',    icon: 'Crown'   },
];

// Resolve a civicScore to its level name.
export const levelFor = (score = 0) => {
  const tier = LEVEL_THRESHOLDS.find(l => score >= l.min && score <= l.max);
  return tier ? tier.name : 'Newcomer';
};

export const BADGE_CONDITIONS = [
  { id: 'first_step',       name: 'First Step',       condition: (p) => p.issuesReported >= 1 },
  { id: 'keen_eye',          name: 'Keen Eye',          condition: (p) => p.issuesReported >= 5 },
  { id: 'guardian',          name: 'Guardian',          condition: (p) => p.issuesReported >= 10 },
  { id: 'community_star',   name: 'Community Star',    condition: (p) => p.issuesResolved >= 1 },
  { id: 'streak_hero',      name: 'Streak Hero',       condition: (p) => p.civicScore >= 100 },
  { id: 'social_voice',     name: 'Social Voice',      condition: (p) => p.issuesShared >= 3 },
  { id: 'verifier',         name: 'Verifier',          condition: (p) => p.issuesVerified >= 5 },
  { id: 'city_champion',    name: 'City Champion',     condition: (p) => p.civicScore >= 300 },
  { id: 'legend',           name: 'Legend',             condition: (p) => p.civicScore >= 500 },
];

export const ESCALATION_LEVELS = [
  { level: 0, name: 'Ward Officer',         triggerDays: 0  },
  { level: 1, name: 'Department Head',      triggerDays: 7  },
  { level: 2, name: 'Commissioner Office',  triggerDays: 14 },
  { level: 3, name: 'Media & Public Alert', triggerDays: 30 },
];

export const issueColorMap = {
  Pothole:         '#f97316',
  Streetlight:     '#eab308',
  Garbage:         '#22c55e',
  'Water Leakage': '#3b82f6',
  Infrastructure:  '#8b5cf6',
  'Traffic Signal': '#ec4899',
  // Extended civic categories (real dataset taxonomy).
  'Broken Road':                '#f59e0b',
  'Broken Streetlight':         '#eab308',
  'Garbage Dumping':            '#22c55e',
  'Open Manhole':               '#ef4444',
  'Sewage Overflow':            '#0ea5e9',
  'Water Logging':              '#3b82f6',
  'Water Supply Issue':         '#06b6d4',
  'Air Pollution':              '#94a3b8',
  'Noise Pollution':            '#ec4899',
  'Dangerous Tree':             '#16a34a',
  'Footpath Encroachment':      '#a855f7',
  'Illegal Construction':       '#8b5cf6',
  'Stray Animal Menace':        '#d97706',
  'Traffic Signal Malfunction': '#f43f5e',
  Other:           '#64748b',
};
