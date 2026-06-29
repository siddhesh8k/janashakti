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

// Status pipeline. "Needs Verification" sits before Resolved — set when a contributor
// marks an issue resolved; the community then verifies it (collaboration layer).
export const STATUS_PIPELINE = ['Reported', 'Verified', 'In Progress', 'Needs Verification', 'Resolved'];

// Civic roles a contributor can join an issue as (collaboration layer — neutral, civic).
export const COLLAB_ROLES = [
  'Resident', 'Volunteer', 'NGO Member', 'Student', 'Social Worker', 'Municipal Employee', 'Other',
];

export const CIVIC_SCORE_POINTS = {
  REPORT_ISSUE:        10,
  VERIFY_ISSUE:         5,
  SHARE_ISSUE:          5,
  RETWEET_POST:        10,
  ISSUE_RESOLVED:      25,
  DAILY_STREAK:         2,
  AUTHORITY_ACTION:     5,   // authority advances a status (Verify / In Progress)
  AUTHORITY_RESOLVE:   15,   // authority resolves an issue (verified fix photo)
  // ── Collaboration layer ──
  JOIN_ISSUE:           5,   // join an issue as a contributor
  POST_EVIDENCE:       15,   // upload evidence accepted by the Gemini-Vision relevance check
  POST_UPDATE:         10,   // post a helpful progress update
  CORRECT_VOTE:         5,   // verification vote that matched the final outcome
  CONTRIBUTOR_RESOLVED:25,   // active contributor reward when the issue closes
  PENALTY_SPAM:       -10,
  PENALTY_FALSE_EVIDENCE:  -15,
  PENALTY_FAKE_RESOLUTION: -20,
};

// Civic points that unlock the "Civic Authority" badge — the gamification gate that
// grants authority powers (advance status / resolve an issue). Only users who reach
// this score are treated as genuine/trusted enough to act as an authority.
// (Mirrored in firestore.rules; keep the two in sync.)
export const AUTHORITY_THRESHOLD = 100;

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
  // Unlocking this badge grants authority powers (verify / resolve) — see AUTHORITY_THRESHOLD.
  { id: 'civic_authority',  name: 'Civic Authority',   condition: (p) => (p.civicScore || 0) >= AUTHORITY_THRESHOLD },
  // ── Collaboration layer badges ──
  { id: 'neighborhood_hero', name: 'Neighborhood Hero', condition: (p) => (p.issuesResolved || 0) >= 1 },
  { id: 'road_guardian',     name: 'Road Guardian',     condition: (p) => (p.issuesJoined || 0) >= 5 },
  { id: 'evidence_expert',   name: 'Evidence Expert',   condition: (p) => (p.evidenceUploaded || 0) >= 10 },
  { id: 'community_builder', name: 'Community Builder', condition: (p) => (p.issuesJoined || 0) >= 10 },
  { id: 'top_verifier',      name: 'Top Verifier',      condition: (p) => (p.verificationsGiven || 0) >= 10 },
];

export const ESCALATION_LEVELS = [
  { level: 0, name: 'Ward Officer',         triggerDays: 0  },
  { level: 1, name: 'Department Head',      triggerDays: 7  },
  { level: 2, name: 'Commissioner Office',  triggerDays: 14 },
  { level: 3, name: 'Media & Public Alert', triggerDays: 30 },
];

// Lat/lng degree window treated as "the same place" (~200 m) — shared by the
// duplicate detector (active reports) and the recurrence detector (resolved reports).
export const NEARBY_GEO_BOUND = 0.002;

// A resolved issue that recurs at the same spot within this many days is flagged as a
// RECURRENCE: the new report links back to the prior complaint and the authority email
// calls out that the earlier fix did not hold. 365 = one year.
export const RECURRENCE_WINDOW_DAYS = 365;

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
