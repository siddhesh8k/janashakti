import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, increment } from 'firebase/firestore';
import { Share2, MapPin, Users, Clock, CheckCircle, Copy,
         ThumbsUp, Scale, AlertTriangle, Twitter, Linkedin,
         MessageCircle, TrendingUp, ShieldAlert, ArrowUpCircle,
         Building2, GraduationCap, Facebook, Send, Landmark, Leaf, Target, RotateCcw } from 'lucide-react';
import { db, auth } from '../firebase';
import { generateRTI } from '../utils/gemini';
import { videoPosterUrl, cloudinaryThumb } from '../utils/cloudinary';
import { getShareLinks } from '../utils/social';
import { triggerN8N } from '../utils/n8n';
import { checkAndEscalate, getEscalationInfo } from '../utils/escalation';
import { distanceKm, VERIFY_RADIUS_KM } from '../utils/geo';
import { useSharedLocation } from '../components/LocationProvider';
import { getWardRepresentative, getRepresentativeForCity } from '../constants/representatives';
import TopNav from '../components/TopNav';
import SeverityBadge from '../components/SeverityBadge';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import PressureMeter from '../components/PressureMeter';
import ResolutionCelebration from '../components/ResolutionCelebration';
import LoadingScreen from '../components/LoadingScreen';
import { useToast } from '../components/ToastProvider';
import { statusColor } from '../theme/components';
import { STATUS_PIPELINE, CIVIC_SCORE_POINTS, ESCALATION_LEVELS } from '../constants/issueTypes';
import { bumpPublicProfile } from '../utils/publicProfile';
import { confirmIssue } from '../utils/confirmIssue';
import { useIssueTimeline } from '../hooks/useIssueTimeline';
import ContributorSection from '../components/collaboration/ContributorSection';
import ActivityTimeline from '../components/collaboration/ActivityTimeline';
import EvidenceUploader from '../components/collaboration/EvidenceUploader';
import CommunityVerification from '../components/collaboration/CommunityVerification';
import { claimCloseReward, markNeedsVerification, isContributor } from '../utils/collaboration';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ESGScoreCard from '../components/ESGScoreCard';
import SDGBadge from '../components/SDGBadge';
import { scoreESGImpact } from '../agents/esgScorer';
import { predictResolution } from '../agents/resolutionPredictor';
import { ISSUE_SDG_MAP } from '../constants/esg';

export default function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location: myLocation, accuracy: myAccuracy } = useSharedLocation();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const toastApi = useToast();
  const setToast = (t) => { if (t) toastApi.show(t.msg, t.type); };
  const [rtiLoading, setRtiLoading] = useState(false);
  const [rtiText, setRtiText] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const prevStatusRef = useRef(null);
  const escalateCheckedRef = useRef(false);
  const sharedRef = useRef(false);
  const repostedRef = useRef(false);
  const awardedRef = useRef(false);
  const esgScoredRef = useRef(false);
  const [showESGModal, setShowESGModal] = useState(false);
  const { events: timelineEvents, loading: timelineLoading } = useIssueTimeline(id);
  const [refreshingPred, setRefreshingPred] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'issues', id),
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          // Detect a live transition into Resolved → celebrate + award once.
          if (prevStatusRef.current && prevStatusRef.current !== 'Resolved'
              && data.status === 'Resolved') {
            setShowCelebration(true);
            awardResolution(data);
          }
          prevStatusRef.current = data.status;
          setIssue(data);
        }
        setLoading(false);
      },
      (err) => { console.error('[IssueDetail]:', err); setLoading(false); }
    );
    return unsub;
  }, [id]);

  // Award +25 to the reporter once when their issue is resolved.
  const awardResolution = async (data) => {
    const uid = auth.currentUser?.uid;
    if (awardedRef.current || data.resolutionCelebrated) return;
    if (uid !== data.userId) return;
    awardedRef.current = true;
    try {
      await updateDoc(doc(db, 'users', uid), {
        civicScore: increment(CIVIC_SCORE_POINTS.ISSUE_RESOLVED),
        issuesResolved: increment(1),
      });
      await bumpPublicProfile(uid, { civicScore: CIVIC_SCORE_POINTS.ISSUE_RESOLVED });
      await updateDoc(doc(db, 'issues', data.id), { resolutionCelebrated: true });
    } catch (err) { console.error('[awardResolution]:', err); }
  };

  // Claim-on-view: an active contributor self-awards the close reward once when viewing a
  // Resolved issue (Firestore rules forbid the resolver writing other users' reputation).
  useEffect(() => {
    if (issue?.status === 'Resolved' && auth.currentUser) {
      claimCloseReward(issue.id, auth.currentUser, issue);
    }
  }, [issue?.status, issue?.id]);

  // A contributor (or the reporter) marks the issue resolved → opens community verification.
  const handleMarkResolved = async () => {
    if (!auth.currentUser) { setToast({ msg: 'Sign in first', type: 'error' }); return; }
    const res = await markNeedsVerification(id, auth.currentUser);
    setToast(res?.ok
      ? { msg: 'Marked resolved — the community will verify', type: 'success' }
      : { msg: res?.error || 'Could not update', type: 'error' });
  };

  // Re-run Agent 4 with live collaboration signals (contributors, evidence, activity).
  // Owner-only — `prediction` is an authority field.
  const handleRefreshPrediction = async () => {
    if (!issue) return;
    setRefreshingPred(true);
    try {
      const now = Date.now();
      const evidenceCount = timelineEvents.filter((e) => e.action === 'evidence_uploaded').length;
      const timelineDensity = timelineEvents.filter(
        (e) => e.createdAt?.toDate && now - e.createdAt.toDate().getTime() < 7 * 86400000,
      ).length;
      const pred = await predictResolution({
        ...issue,
        contributorCount: issue.contributors?.length || 0,
        evidenceCount, timelineDensity,
      }, issue.id);
      await updateDoc(doc(db, 'issues', issue.id), { prediction: pred });
      setToast({ msg: 'Prediction refreshed with community signals', type: 'success' });
    } catch (err) {
      console.error('[refreshPrediction]:', err);
      setToast({ msg: 'Could not refresh prediction', type: 'error' });
    }
    setRefreshingPred(false);
  };

  // Auto-escalation: check once when the issue loads.
  useEffect(() => {
    if (!issue || escalateCheckedRef.current || issue.status === 'Resolved') return;
    escalateCheckedRef.current = true;
    checkAndEscalate(issue).then((r) => {
      if (r?.escalated) setToast({ msg: `Escalated to ${r.escalatedTo}`, type: 'info' });
    });
  }, [issue]);

  // ESG scoring: once an issue is Resolved and not yet scored, generate its ESG
  // impact. scoreESGImpact writes esgScore to the issue doc; the onSnapshot listener
  // above then refreshes local state, so the score card appears automatically.
  useEffect(() => {
    if (!issue || esgScoredRef.current) return;
    if (issue.status !== 'Resolved' || issue.esgScore) return;
    // Only the reporter (owner) auto-scores from here — they can write both the issue
    // and their own stats. Authorities score at resolution time (AuthorityDashboard);
    // other viewers can't write esgScore, so triggering it would just waste a call.
    if (issue.userId !== auth.currentUser?.uid) return;
    esgScoredRef.current = true;
    scoreESGImpact(issue, id).catch((e) => console.error('[ESG]:', e));
  }, [issue, id]);

  const handleVerify = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setToast({ msg: 'Sign in to verify', type: 'error' }); return; }
    // One verification per user per issue (the reporter is already counted).
    if (issue.confirmedBy?.includes(uid)) {
      setToast({ msg: 'You already verified this issue', type: 'info' }); return;
    }
    // Geofence: a real location fix is required, and it must be within 500m.
    if (!myLocation || myAccuracy == null || issue.location?.lat == null) {
      setToast({ msg: 'Waiting for your location — enable GPS to verify', type: 'info' }); return;
    }
    if (distanceKm(myLocation.lat, myLocation.lng, issue.location.lat, issue.location.lng) > VERIFY_RADIUS_KM) {
      setToast({ msg: 'Move within 500m of the issue to verify', type: 'error' }); return;
    }
    try {
      // Atomic confirm — also decides (race-free) whether this is the post-trigger.
      const res = await confirmIssue(id, uid);
      if (res.alreadyConfirmed) {
        setToast({ msg: 'You already verified this issue', type: 'info' });
        return;
      }
      await updateDoc(doc(db, 'users', uid), {
        civicScore: increment(CIVIC_SCORE_POINTS.VERIFY_ISSUE),
        issuesVerified: increment(1),
      });
      await bumpPublicProfile(uid, { civicScore: CIVIC_SCORE_POINTS.VERIFY_ISSUE });

      // Guaranteed to be true for exactly one verifier — the one whose confirmation
      // crossed the threshold (socialQueued flag set inside the transaction).
      if (res.shouldPost) {
        triggerN8N('social_post', {
          issueId: id,
          issueType: issue.issueType,
          severity: issue.severity,
          location: issue.locationText,
          description: issue.description,
          photoUrl: issue.photoUrl,
          confirmations: res.newCount,
          socialConsent: issue.socialConsent,
          userXHandle: issue.userXHandle,
        }).catch((e) => console.error('[Social]:', e));
        setToast({ msg: '5 verifications reached — posting to @JanaShaktiApp!', type: 'success' });
      } else {
        setToast({ msg: '+5 Civic Points! Verified', type: 'success' });
      }
    } catch (err) {
      console.error('[Verify]:', err);
      setToast({ msg: 'Failed to verify', type: 'error' });
    }
  };

  const handleRTI = async () => {
    setRtiLoading(true);
    try {
      const text = await generateRTI(issue);
      setRtiText(text);
      // Credit the RTI on the user's own doc — powers the "Justice Seeker" ESG badge.
      const uid = auth.currentUser?.uid;
      if (uid) {
        updateDoc(doc(db, 'users', uid), { rtiFiled: increment(1) })
          .catch((e) => console.error('[RTI credit]:', e.message));
      }
    } catch (err) {
      console.error('[RTI]:', err);
      setToast({ msg: 'RTI generation failed', type: 'error' });
    } finally {
      setRtiLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${issue.issueType} — JanaShakti`,
        text: issue.description,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setToast({ msg: 'Link copied!', type: 'info' });
    }
    creditShare();
  };

  // Open an external share intent and credit the user (once per visit).
  const shareTo = (url, credit = creditShare) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    credit();
  };

  const creditShare = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || sharedRef.current) return;
    sharedRef.current = true;
    try {
      await updateDoc(doc(db, 'users', uid), {
        issuesShared: increment(1),
        civicScore: increment(CIVIC_SCORE_POINTS.SHARE_ISSUE),
      });
      await bumpPublicProfile(uid, { civicScore: CIVIC_SCORE_POINTS.SHARE_ISSUE });
      setToast({ msg: '+5 Civic Points! Thanks for sharing', type: 'success' });
    } catch (err) { console.error('[Share credit]:', err); }
  };

  // Reposting amplifies an existing @JanaShaktiApp post — worth more (+10).
  const creditRepost = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || repostedRef.current) return;
    repostedRef.current = true;
    try {
      await updateDoc(doc(db, 'users', uid), {
        civicScore: increment(CIVIC_SCORE_POINTS.RETWEET_POST),
      });
      await bumpPublicProfile(uid, { civicScore: CIVIC_SCORE_POINTS.RETWEET_POST });
      setToast({ msg: '+10 Civic Points! Thanks for reposting', type: 'success' });
    } catch (err) { console.error('[Repost credit]:', err); }
  };

  // Share the AI-generated ESG impact as social-ready text (Web Share API → clipboard).
  const shareESG = () => {
    const e = issue?.esgScore;
    if (!e) return;
    const shareText =
      `✅ Civic issue resolved in ${issue.city || 'your area'}!\n\n` +
      `ESG Impact via @JanaShaktiApp:\n` +
      `\u{1F33F} E Score: ${e.e_score}/10\n` +
      `\u{1F91D} S Score: ${e.s_score}/10\n` +
      `⚖️ G Score: ${e.g_score}/10\n\n` +
      `${e.highlight}\n\n` +
      `SDGs: ${(e.sdg_tags || []).join(' ')}\n\n` +
      `#JanaShakti #ESG #SDG #CivicTech`;
    if (navigator.share) {
      navigator.share({ title: 'ESG Impact — JanaShakti', text: shareText }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText);
      setToast({ msg: 'ESG impact copied!', type: 'info' });
    }
    creditShare();
  };

  if (loading) return <LoadingScreen />;
  if (!issue) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#94a3b8' }}>Issue not found</p>
    </div>
  );

  const timeAgo = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    return days === 0 ? 'Today' : `${days}d ago`;
  };

  const shareLinks = getShareLinks(issue, issue.xPostUrl);

  // Verify-button state: one vote per user, requires a real GPS fix within 500m.
  // Gate on `accuracy != null` so the geolocation hook's coarse fallback position
  // isn't mistaken for an actual fix.
  const myUid = auth.currentUser?.uid;
  const alreadyVerified = !!myUid && issue.confirmedBy?.includes(myUid);
  const locationKnown = !!myLocation && myAccuracy != null && issue.location?.lat != null;
  const inRange = locationKnown &&
    distanceKm(myLocation.lat, myLocation.lng, issue.location.lat, issue.location.lng) <= VERIFY_RADIUS_KM;
  const outOfRange = locationKnown && !inRange;
  const canVerify = !alreadyVerified && inRange;
  // Elected representative responsible for this issue's ward — stored at report time, or
  // derived on-the-fly for older issues. Neutral metadata only (no party styling).
  const wardRep = issue.wardInfo ||
    getWardRepresentative(issue.location?.lat, issue.location?.lng) ||
    getRepresentativeForCity(issue.city);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title={issue.issueType} showBack
        rightElement={
          <button onClick={handleShare} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Share2 size={20} color="#f0f6ff" strokeWidth={1.5} />
          </button>
        }
      />

      {/* Media — video (Cloudinary) or inline photo */}
      {issue.mediaType === 'video' && issue.videoUrl ? (
        <video src={issue.videoUrl} controls playsInline poster={videoPosterUrl(issue.videoUrl)}
          style={{ width: '100%', height: '240px', objectFit: 'cover', backgroundColor: '#04091a' }} />
      ) : issue.photoUrl ? (
        <img src={cloudinaryThumb(issue.photoUrl, 720)} alt="Issue" loading="lazy" decoding="async" style={{
          width: '100%', height: '240px', objectFit: 'cover',
        }} />
      ) : null}

      <div style={{ padding: '16px' }}>
        {/* Resolution — before/after comparison + AI verification badge */}
        {issue.status === 'Resolved' && issue.resolutionPhotoUrl && issue.photoUrl && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Resolution — Before / After</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '999px',
                backgroundColor: issue.resolutionVerified ? '#16a34a1a' : '#f973161a',
                color: issue.resolutionVerified ? '#16a34a' : '#f97316',
                border: `0.5px solid ${issue.resolutionVerified ? '#16a34a40' : '#f9731640'}`,
              }}>
                {issue.resolutionVerified
                  ? <CheckCircle size={12} strokeWidth={2} />
                  : <AlertTriangle size={12} strokeWidth={2} />}
                {issue.resolutionVerified ? 'AI-verified' : 'Unverified'}
                {typeof issue.resolutionConfidence === 'number' ? ` · ${issue.resolutionConfidence}%` : ''}
              </span>
            </div>
            <BeforeAfterSlider before={issue.photoUrl} after={issue.resolutionPhotoUrl} />
            {issue.resolutionNote && (
              <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, marginTop: '8px' }}>
                <span style={{ color: '#4a6280' }}>AI check: </span>{issue.resolutionNote}
              </p>
            )}
          </div>
        )}

        {/* ESG Impact — appears once an issue is Resolved */}
        {issue.status === 'Resolved' && (() => {
          const sdgInfo = ISSUE_SDG_MAP[issue.issueType] || ISSUE_SDG_MAP.Other;
          return (
            <div style={{ marginBottom: '16px' }}>
              {/* SDG preview — shown even before the ESG score finishes generating */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Target size={12} color="#4a6280" strokeWidth={1.5} />
                <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                               textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  SDG Alignment
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {sdgInfo.sdgs.map((s, i) => (
                  <SDGBadge key={s} sdgId={s} name={sdgInfo.names?.[i]} size="md" />
                ))}
              </div>

              {/* ESG score card, or a loading state while Gemini scores it */}
              {issue.esgScore ? (
                <ESGScoreCard esgScore={issue.esgScore} />
              ) : (
                <div>
                  <LoadingSkeleton type="text" count={3} />
                  <p style={{ fontSize: '12px', color: '#4a6280', textAlign: 'center', marginTop: '4px' }}>
                    Generating ESG impact analysis...
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#f0f6ff' }}>
            {issue.issueType}
          </h2>
          <SeverityBadge severity={issue.severity} />
        </div>

        {/* Complaint ID */}
        {issue.complaintId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', color: '#4a6280', fontWeight: '500' }}>Complaint No:</span>
            <span style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '12px', fontWeight: '600', color: '#00d4ff',
              backgroundColor: '#00d4ff15', border: '0.5px solid #00d4ff40',
              borderRadius: '6px', padding: '4px 10px', letterSpacing: '0.5px',
            }}>{issue.complaintId}</span>
            <button onClick={() => {
              navigator.clipboard.writeText(issue.complaintId);
              setToast({ msg: 'Complaint ID copied!', type: 'info' });
            }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center' }}>
              <Copy size={14} color="#4a6280" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Recurrence — this exact issue was resolved before and came back within a year */}
        {issue.recurrenceOf && (
          <div
            onClick={() => navigate(`/issue/${issue.recurrenceOf}`)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              backgroundColor: '#f9731614', border: '0.5px solid #f9731640',
              borderLeft: '3px solid #f97316', borderRadius: '12px',
              padding: '12px 14px', marginBottom: '14px', cursor: 'pointer',
            }}
          >
            <RotateCcw size={18} strokeWidth={1.5} color="#f97316"
                       style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#f0f6ff' }}>
                Recurring issue{issue.recurrenceCount > 1 ? ` (#${issue.recurrenceCount})` : ''} — the earlier fix did not hold
              </div>
              <div style={{ fontSize: '12px', fontWeight: '400', color: '#94a3b8', marginTop: '3px' }}>
                Previously resolved
                {issue.recurrenceDaysSince != null ? ` ${issue.recurrenceDaysSince} days ago` : ''}
                {issue.recurrenceOfComplaintId ? ` · ${issue.recurrenceOfComplaintId}` : ''}. The authority was notified of the recurrence.
              </div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#00d4ff', marginTop: '5px' }}>
                View the earlier report →
              </div>
            </div>
          </div>
        )}

        {/* Status timeline */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', alignItems: 'center' }}>
          {STATUS_PIPELINE.map((s, i) => {
            const reached = STATUS_PIPELINE.indexOf(issue.status) >= i;
            const color = reached ? statusColor(s) : '#1a2f4a';
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  backgroundColor: reached ? color : 'transparent',
                  border: `2px solid ${color}`,
                }} />
                <span style={{ fontSize: '9px', color: reached ? '#f0f6ff' : '#4a6280',
                               fontWeight: reached ? '600' : '400' }}>{s}</span>
                {i < STATUS_PIPELINE.length - 1 && (
                  <div style={{ flex: 1, height: '1px', backgroundColor: color }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Wall of Shame banner */}
        {issue.wallOfShame && (
          <div style={{
            backgroundColor: '#ef44441a', borderRadius: '10px',
            padding: '10px 14px', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <AlertTriangle size={16} color="#ef4444" strokeWidth={1.5} />
            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
              CHRONIC IGNORED ISSUE
            </span>
          </div>
        )}

        {/* Description */}
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                      border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
            {issue.description}
          </p>
        </div>

        {/* AI Prediction */}
        {issue.prediction && (
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                        border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                             textTransform: 'uppercase', letterSpacing: '0.7px' }}>AI PREDICTION</span>
              {auth.currentUser?.uid === issue.userId && (
                <button onClick={handleRefreshPrediction} disabled={refreshingPred} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none',
                  border: '0.5px solid #1a2f4a', borderRadius: '8px', padding: '4px 9px',
                  color: '#7ee8fa', fontSize: '10px', fontWeight: '600',
                  cursor: refreshingPred ? 'default' : 'pointer' }}>
                  <RotateCcw size={11} strokeWidth={1.5} /> {refreshingPred ? 'Refreshing…' : 'Refresh'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
              <div>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#00d4ff' }}>
                  {issue.prediction.priority_score}
                </span>
                <span style={{ fontSize: '10px', color: '#4a6280' }}>/100</span>
                <div style={{ fontSize: '10px', color: '#4a6280' }}>Priority</div>
              </div>
              <div>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#f0f6ff' }}>
                  ~{issue.prediction.predicted_days}
                </span>
                <div style={{ fontSize: '10px', color: '#4a6280' }}>days</div>
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '600',
                  color: issue.prediction.escalation_risk === 'Critical' ? '#ef4444' :
                         issue.prediction.escalation_risk === 'High' ? '#f97316' : '#eab308' }}>
                  {issue.prediction.escalation_risk}
                </span>
                <div style={{ fontSize: '10px', color: '#4a6280' }}>Risk</div>
              </div>
            </div>
          </div>
        )}

        {/* Escalation Chain */}
        {issue.status !== 'Resolved' && (() => {
          const esc = getEscalationInfo(issue);
          return (
            <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                          border: '0.5px solid #1a2f4a', borderLeft: `3px solid ${esc.color}`,
                          padding: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                <ShieldAlert size={16} color={esc.color} strokeWidth={1.5} />
                <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                               textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Escalation Chain
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>
                  {esc.daysOpen}d open
                </span>
              </div>

              {/* 4 dots connected by lines */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                {ESCALATION_LEVELS.map((lvl, i) => {
                  const reached = esc.currentLevel >= lvl.level;
                  const c = ['#16a34a', '#f97316', '#ef4444', '#7f1d1d'][lvl.level];
                  return (
                    <div key={lvl.level} style={{ display: 'flex', alignItems: 'center',
                                                  flex: i < ESCALATION_LEVELS.length - 1 ? 1 : 'none' }}>
                      <div style={{
                        width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
                        backgroundColor: reached ? c : 'transparent',
                        border: `2px solid ${reached ? c : '#1a2f4a'}`,
                      }} />
                      {i < ESCALATION_LEVELS.length - 1 && (
                        <div style={{ flex: 1, height: '2px',
                          backgroundColor: esc.currentLevel > lvl.level ? c : '#1a2f4a' }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                {ESCALATION_LEVELS.map((lvl) => (
                  <span key={lvl.level} style={{
                    fontSize: '8px', flex: 1, textAlign: 'center',
                    color: esc.currentLevel >= lvl.level ? '#94a3b8' : '#4a6280',
                  }}>{lvl.name.split(' ')[0]}</span>
                ))}
              </div>

              <p style={{ fontSize: '12px', color: '#f0f6ff', fontWeight: '600' }}>
                Currently with: <span style={{ color: esc.color }}>{esc.currentAuthority}</span>
              </p>
              {esc.nextAuthority && (
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px',
                            display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ArrowUpCircle size={11} strokeWidth={1.5} />
                  {esc.daysUntilNextEscalation === 0
                    ? `Escalating to ${esc.nextAuthority} now`
                    : `Next escalation in ${esc.daysUntilNextEscalation}d → ${esc.nextAuthority}`}
                </p>
              )}
            </div>
          );
        })()}

        {/* Authority routing */}
        {issue.routedTo && (
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                        border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: '600' }}>
              Auto-routed to:
            </span>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff', marginTop: '4px' }}>
              {issue.routedTo.departmentName}
            </p>
            {issue.routedTo.emailSent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <CheckCircle size={12} color="#16a34a" strokeWidth={2} />
                <span style={{ fontSize: '11px', color: '#86efac' }}>Formal email sent</span>
              </div>
            )}
          </div>
        )}

        {/* Adopted zone */}
        {issue.adoptedBy && (
          <div style={{
            backgroundColor: '#0d1b2e', borderRadius: '14px',
            border: '0.5px solid #3b82f640', padding: '14px',
            marginBottom: '10px',
            borderLeft: '3px solid #3b82f6',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {issue.adoptedBy.type === 'college'
                ? <GraduationCap size={16} color="#3b82f6" strokeWidth={1.5} />
                : <Building2 size={16} color="#3b82f6" strokeWidth={1.5} />
              }
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                Adopted by {issue.adoptedBy.name}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
              This area is under the civic adoption program of {issue.adoptedBy.name}.
              {issue.adoptedBy.type === 'company'
                ? ' Their employees actively monitor and report issues here as part of CSR.'
                : ' Students contribute to keeping this area clean as part of civic duty.'}
            </p>
          </div>
        )}

        {/* Elected representative accountability — neutral, factual. Party shown only as
            muted metadata; no party colors or logos. */}
        {wardRep?.representative && (
          <div style={{
            backgroundColor: '#0d1b2e', borderRadius: '14px',
            border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Landmark size={14} color="#8b5cf6" strokeWidth={1.5} />
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#8b5cf6',
                             textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {wardRep.selfDeclared ? 'Ward representative' : 'Your elected representative'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff', marginBottom: '2px' }}>
                  {wardRep.representative.name}
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Ward {wardRep.wardNo} — {wardRep.wardName}
                </p>
                <p style={{ fontSize: '11px', color: '#4a6280', marginTop: '2px' }}>
                  {wardRep.representative.role || 'Civic role'} · Since {wardRep.representative.since}{wardRep.representative.party ? ` · ${wardRep.representative.party}` : ''}
                </p>
                {wardRep.selfDeclared && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px',
                                 fontSize: '10px', fontWeight: '600', color: '#7ee8fa',
                                 backgroundColor: '#00d4ff14', border: '0.5px solid #00d4ff33',
                                 borderRadius: '999px', padding: '2px 8px' }}>
                    Self-declared · community-tracked
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#4a6280' }}>
                  This issue is in their ward
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Civic collaboration layer ── */}
        <ContributorSection issue={issue} events={timelineEvents} />

        {auth.currentUser && issue.status !== 'Resolved' && issue.status !== 'Needs Verification'
          && (issue.userId === auth.currentUser.uid || isContributor(issue, auth.currentUser.uid)) && (
          <button onClick={handleMarkResolved} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            backgroundColor: 'transparent', color: '#16a34a', border: '1px solid #16a34a',
            borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', marginBottom: '10px' }}>
            <CheckCircle size={16} strokeWidth={1.5} /> Mark as resolved — request verification
          </button>
        )}

        <CommunityVerification issue={issue} />
        <EvidenceUploader issue={issue} events={timelineEvents} />
        <ActivityTimeline events={timelineEvents} loading={timelineLoading} />

        {/* Pressure Meter */}
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                      border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px' }}>
          <PressureMeter confirmations={issue.confirmations} />
        </div>

        {/* Verify button — one vote per user, within 500m only */}
        <button onClick={handleVerify} disabled={!canVerify} style={{
          width: '100%', padding: '13px',
          backgroundColor: canVerify ? '#16a34a' : '#112035',
          color: canVerify ? '#ffffff' : '#4a6280',
          border: canVerify ? 'none' : '0.5px solid #1a2f4a', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600', cursor: canVerify ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginBottom: '10px',
        }}>
          {alreadyVerified ? (
            <><CheckCircle size={16} strokeWidth={2} /> You verified this issue</>
          ) : !locationKnown ? (
            <><MapPin size={16} strokeWidth={1.5} /> Detecting your location…</>
          ) : outOfRange ? (
            <><MapPin size={16} strokeWidth={1.5} /> Move within 500m to verify</>
          ) : (
            <><ThumbsUp size={16} strokeWidth={2} /> Verify this issue (+5 pts)</>
          )}
        </button>

        {/* Tools row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button onClick={() => {
            navigator.clipboard.writeText(issue.complaintText || issue.description);
            setToast({ msg: 'Copied!', type: 'info' });
          }} style={{
            flex: 1, padding: '10px', backgroundColor: 'transparent',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          }}>
            <Copy size={14} strokeWidth={1.5} /> Copy
          </button>
          <button onClick={handleRTI} disabled={rtiLoading} style={{
            flex: 1, padding: '10px', backgroundColor: 'transparent',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          }}>
            <Scale size={14} strokeWidth={1.5} /> {rtiLoading ? 'Generating...' : 'Generate RTI'}
          </button>
          <button onClick={handleShare} style={{
            flex: 1, padding: '10px', backgroundColor: 'transparent',
            color: '#00d4ff', border: '0.5px solid #1a2f4a', borderRadius: '10px',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          }}>
            <Share2 size={14} strokeWidth={1.5} /> Share
          </button>
          {issue.esgScore && (
            <button onClick={() => setShowESGModal(true)} style={{
              flex: 1, padding: '10px', backgroundColor: 'transparent',
              color: '#16a34a', border: '0.5px solid #16a34a40', borderRadius: '10px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}>
              <Leaf size={14} strokeWidth={1.5} /> ESG Report
            </button>
          )}
        </div>

        {/* RTI output */}
        {rtiText && (
          <div style={{ backgroundColor: '#112035', borderRadius: '10px',
                        padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#f0f6ff' }}>RTI Application</span>
              <button onClick={() => {
                navigator.clipboard.writeText(rtiText);
                setToast({ msg: 'RTI copied!', type: 'info' });
              }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Copy size={14} color="#00d4ff" strokeWidth={1.5} />
              </button>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6,
                        whiteSpace: 'pre-wrap' }}>{rtiText}</p>
          </div>
        )}

        {/* Your amplify powers */}
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                      border: '0.5px solid #1a2f4a', padding: '14px', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         textTransform: 'uppercase', letterSpacing: '0.7px' }}>Your Amplify Powers</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {[
              { label: 'X', icon: Twitter, color: '#00d4ff', url: shareLinks.xShare },
              { label: 'WhatsApp', icon: MessageCircle, color: '#16a34a', url: shareLinks.whatsapp },
              { label: 'LinkedIn', icon: Linkedin, color: '#3b82f6', url: shareLinks.linkedin },
              { label: 'Facebook', icon: Facebook, color: '#60a5fa', url: shareLinks.facebook },
              { label: 'Telegram', icon: Send, color: '#7ee8fa', url: shareLinks.telegram },
            ].map(({ label, icon: Icon, color, url }) => (
              <button key={label} onClick={() => shareTo(url)} style={{
                flex: '1 1 calc(33.333% - 8px)', padding: '10px', backgroundColor: '#112035',
                color, border: '0.5px solid #1a2f4a', borderRadius: '10px',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}>
                <Icon size={14} strokeWidth={1.5} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Social proof */}
        {issue.xPosted && (
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                        border: '0.5px solid #00d4ff40', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Twitter size={14} color="#00d4ff" strokeWidth={1.5} />
              <span style={{ fontSize: '12px', color: '#00d4ff', fontWeight: '600' }}>
                Posted on @JanaShaktiApp
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {issue.xPostUrl && (
                <a href={issue.xPostUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: '#00d4ff' }}>View Post</a>
              )}
              <button onClick={() => shareTo(shareLinks.retweet, creditRepost)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: '12px', fontWeight: '600', color: '#16a34a',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <TrendingUp size={13} strokeWidth={1.5} /> Repost +10pts
              </button>
            </div>
          </div>
        )}

        {/* Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      padding: '8px 0', marginTop: '8px' }}>
          <span style={{ fontSize: '11px', color: '#4a6280', display: 'flex',
                         alignItems: 'center', gap: '4px' }}>
            <MapPin size={11} strokeWidth={1.5} />
            {issue.locationText?.split(',').slice(0, 2).join(',') || 'Unknown'}
          </span>
          <span style={{ fontSize: '11px', color: '#4a6280', display: 'flex',
                         alignItems: 'center', gap: '4px' }}>
            <Clock size={11} strokeWidth={1.5} />
            {timeAgo(issue.createdAt)}
          </span>
        </div>
      </div>
      {showCelebration && (
        <ResolutionCelebration issue={issue} onClose={() => setShowCelebration(false)} />
      )}
      {showESGModal && issue.esgScore && (
        <div onClick={() => setShowESGModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(4,9,26,0.8)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto',
            backgroundColor: '#080f1e', border: '0.5px solid #1a2f4a',
            borderTopLeftRadius: '18px', borderTopRightRadius: '18px', padding: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#f0f6ff' }}>
                ESG Impact Report
              </span>
              <button onClick={() => setShowESGModal(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: '22px', lineHeight: 1, padding: 0,
              }}>×</button>
            </div>
            <ESGScoreCard esgScore={issue.esgScore} />
            <button onClick={shareESG} style={{
              width: '100%', padding: '13px', marginTop: '6px',
              backgroundColor: '#00d4ff', color: '#04091a', border: 'none',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <Share2 size={16} strokeWidth={2} /> Share Impact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
