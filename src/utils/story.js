// Pure story-readiness + claim-window logic for the Journalist Dashboard.
// Kept free of React/Firebase imports (caller passes uid) so it's unit-testable.
// `now` is injectable for deterministic tests; defaults to the current time.

export const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h exclusive window

export const daysOpenOf = (issue, now = Date.now()) => {
  if (!issue?.createdAt) return 0;
  const d = issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt);
  return Math.floor((now - d.getTime()) / 86400000);
};

// An issue is story-ready when it meets at least 3 of the 6 newsworthiness signals.
export const storyCriteria = (issue, now = Date.now()) => {
  const days = daysOpenOf(issue, now);
  const checks = [
    issue.status !== 'Resolved',
    days >= 14,
    (issue.confirmations || 0) >= 5,
    (issue.escalationLevel || 0) >= 1,
    issue.routedTo?.emailSent === true,
    issue.severity === 'Critical' || issue.severity === 'High',
  ];
  return { days, met: checks.filter(Boolean).length };
};

export const isStoryReady = (issue, now = Date.now()) => storyCriteria(issue, now).met >= 3;

// Exclusive-claim state of an issue relative to `uid`.
// 'open' (unclaimed or expired) | 'mine' | 'locked' (held by someone else).
export const claimStatus = (issue, uid, now = Date.now()) => {
  if (!issue.storyClaimedBy) return { state: 'open' };
  const ts = issue.storyClaimedAt;
  const claimedAt = ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : new Date(now);
  const elapsed = now - claimedAt.getTime();
  if (elapsed >= CLAIM_WINDOW_MS) return { state: 'open' }; // expired → available again
  const hoursRemaining = Math.max(1, Math.ceil((CLAIM_WINDOW_MS - elapsed) / 3600000));
  if (issue.storyClaimedBy === uid) return { state: 'mine', hoursRemaining };
  return { state: 'locked', hoursRemaining };
};
