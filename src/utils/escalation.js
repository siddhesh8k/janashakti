import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { triggerN8N } from './n8n';
import { ESCALATION_LEVELS } from '../constants/issueTypes';

// Color per escalation level: green (ward) → orange → red → dark red (media).
const LEVEL_COLORS = ['#16a34a', '#f97316', '#ef4444', '#7f1d1d'];

const daysSince = (createdAt) => {
  if (!createdAt) return 0;
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  return Math.floor((Date.now() - date.getTime()) / 86400000);
};

// Highest level the issue qualifies for given how long it has been open.
const levelForDays = (daysOpen) => {
  let lvl = 0;
  for (const e of ESCALATION_LEVELS) {
    if (daysOpen >= e.triggerDays) lvl = e.level;
  }
  return lvl;
};

// Side-effecting: bumps escalationLevel if the issue has aged past a higher tier.
// Returns { escalated, from, to, escalatedTo, daysOpen } on escalation, else null.
export async function checkAndEscalate(issue) {
  try {
    if (!issue || issue.status === 'Resolved') return null;
    const daysOpen = daysSince(issue.createdAt);
    const newLevel = levelForDays(daysOpen);
    const currentLevel = issue.escalationLevel || 0;
    if (newLevel <= currentLevel) return null;

    const escalatedTo = ESCALATION_LEVELS[newLevel]?.name || 'Higher authority';
    await updateDoc(doc(db, 'issues', issue.id), {
      escalationLevel: newLevel,
      wallOfShame: daysOpen >= 30,
      updatedAt: serverTimestamp(),
    });

    triggerN8N('escalation', {
      issueId: issue.id,
      complaintId: issue.complaintId || null,
      issueType: issue.issueType,
      location: issue.locationText,
      from: ESCALATION_LEVELS[currentLevel]?.name,
      to: escalatedTo,
      daysOpen,
    }).catch(() => {});

    return { escalated: true, from: currentLevel, to: newLevel, escalatedTo, daysOpen };
  } catch (err) {
    console.error('[escalation]:', err);
    return null;
  }
}

// Read-only display data for the Escalation Chain card.
export function getEscalationInfo(issue) {
  const daysOpen = daysSince(issue?.createdAt);
  const currentLevel = issue?.escalationLevel || 0;
  const next = ESCALATION_LEVELS[currentLevel + 1] || null;
  return {
    currentLevel,
    currentAuthority: ESCALATION_LEVELS[currentLevel]?.name || 'Ward Officer',
    daysOpen,
    daysUntilNextEscalation: next ? Math.max(0, next.triggerDays - daysOpen) : null,
    nextAuthority: next ? next.name : null,
    isWallOfShame: daysOpen >= 30,
    color: LEVEL_COLORS[currentLevel] || LEVEL_COLORS[0],
  };
}
