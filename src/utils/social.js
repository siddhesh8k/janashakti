export const getShareLinks = (issue, xPostUrl) => ({
  retweet: `https://twitter.com/intent/retweet?tweet_id=${xPostUrl?.split('/').pop() || ''}`,
  xShare: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `I reported this civic issue in ${issue.locationText || 'my city'}. Help get it fixed! ${window.location.origin}/issue/${issue.id} #JanaShakti`
  )}`,
  whatsapp: `https://wa.me/?text=${encodeURIComponent(
    `Civic issue reported near you!\n${issue.issueType} at ${issue.locationText || 'Unknown'}\n${issue.confirmations || 0} people confirmed.\nTrack it: ${window.location.origin}/issue/${issue.id}`
  )}`,
  linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    `${window.location.origin}/issue/${issue.id}`
  )}`,
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    `${window.location.origin}/issue/${issue.id}`
  )}`,
  telegram: `https://t.me/share/url?url=${encodeURIComponent(
    `${window.location.origin}/issue/${issue.id}`
  )}&text=${encodeURIComponent(
    `${issue.issueType} at ${issue.locationText || 'my city'} — help get it fixed! #JanaShakti`
  )}`,
});

// Realistic gate: an issue is only amplified on social once the community has
// independently verified it — i.e. 5+ confirmations (4 verifiers beyond the
// reporter). Severity alone no longer triggers an immediate post.
export const POST_CONFIRMATION_THRESHOLD = 5;

export const shouldAutoPost = (issue) => {
  if (issue.socialConsent === 'none') return false;
  return (issue.confirmations || 0) >= POST_CONFIRMATION_THRESHOLD;
};
