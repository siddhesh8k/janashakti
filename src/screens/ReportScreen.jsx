import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle, MapPin, ChevronDown, ChevronUp,
         Copy, Scale, Image, Video, AlertTriangle } from 'lucide-react';
import { collection, addDoc, doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useSharedLocation } from '../components/LocationProvider';
import { compressImage } from '../utils/gemini';
import { uploadVideo } from '../utils/cloudinary';
import { getVideoDuration, extractVideoFrame, MAX_VIDEO_DURATION } from '../utils/media';
import { isReportBlocked, validateReport, MESSAGES } from '../utils/validation';
import { analyzeIssue } from '../agents/issueAnalyzer';
import { orchestrateIssue } from '../agents/orchestrator';
import { triggerN8N } from '../utils/n8n';
import { shouldAutoPost } from '../utils/social';
import { buildComplaintLetter } from '../utils/complaint';
// (adoption now comes from the reporter's saved profile affiliation, not GPS zones)
import { generateComplaintId } from '../utils/complaintId';
import { getWardRepresentative } from '../constants/representatives';
import SeverityBadge from '../components/SeverityBadge';
import AgentPipelineOverlay from '../components/AgentPipelineOverlay';
import LocationPicker from '../components/LocationPicker';
import { useToast } from '../components/ToastProvider';
import { issueColorMap, ISSUE_TYPES, SEVERITY_LEVELS, CIVIC_SCORE_POINTS } from '../constants/issueTypes';
import { bumpPublicProfile } from '../utils/publicProfile';
import { confirmIssue } from '../utils/confirmIssue';

// Guard any await so a hanging Firebase call (e.g. Storage on a misconfigured
// bucket) can never freeze the submit flow.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);

export default function ReportScreen() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { location, locationText, accuracy } = useSharedLocation();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const [step, setStep] = useState(1);
  const [mediaMode, setMediaMode] = useState('photo'); // 'photo' | 'video'
  const [photo, setPhoto] = useState(null);
  const [base64, setBase64] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [socialConsent, setSocialConsent] = useState('anonymous');
  const [xHandle, setXHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]); // live agent-pipeline trace
  const [showComplaint, setShowComplaint] = useState(false);
  const toastApi = useToast();
  const setToast = (t) => { if (t) toastApi.show(t.msg, t.type); };
  const [error, setError] = useState(null);

  // Editable location (seeded from geolocation, then user-owned)
  const [editableAddress, setEditableAddress] = useState('');
  const [pickedLocation, setPickedLocation] = useState(null);
  const addressTouched = useRef(false);
  const locationTouched = useRef(false);

  // Seed address once geolocation resolves (don't clobber user edits)
  useEffect(() => {
    if (!addressTouched.current && locationText &&
        locationText !== 'Detecting...' && locationText !== 'Location not available') {
      setEditableAddress(locationText);
    }
  }, [locationText]);

  useEffect(() => {
    if (!locationTouched.current && location) setPickedLocation(location);
  }, [location]);

  // Manual fallback fields
  const [manualType, setManualType] = useState('Pothole');
  const [manualSeverity, setManualSeverity] = useState('Medium');
  const [manualDesc, setManualDesc] = useState('');
  const [geminiError, setGeminiError] = useState(false);

  const handleMedia = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    // Reset so picking the SAME file again still fires onChange next time.
    input.value = '';
    if (!file) return;

    // ── Video branch: enforce the 10s cap, extract a still frame for Agent 1,
    //    and keep a local object-URL preview. The video itself uploads on submit. ──
    if (file.type.startsWith('video')) {
      try {
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION + 1) {
          setToast({ msg: `Video must be ${MAX_VIDEO_DURATION} seconds or shorter`, type: 'error' });
          return;
        }
      } catch (durErr) {
        console.error('[Video]:', durErr);
        setToast({ msg: 'Could not read that video. Try another clip.', type: 'error' });
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setPhoto(null);
      setStep(2);
      setAnalyzing(true);
      try {
        const frame = await extractVideoFrame(file);
        setBase64(frame); // reused for the Gemini-vision analysis below
        const result = await analyzeIssue(frame, 'temp_' + Date.now());
        setAnalysis(result);
        setStep(3);
      } catch (err) {
        console.error('[Gemini]:', err);
        setGeminiError(true);
        setStep(3);
      } finally {
        setAnalyzing(false);
      }
      return;
    }

    // ── Photo branch (unchanged): inline base64, analyzed and stored as before ──
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPhoto(dataUrl);
      setVideoFile(null);
      setVideoPreview(null);
      const b64 = dataUrl.split(',')[1];
      setBase64(b64);
      setStep(2);
      setAnalyzing(true);
      try {
        const result = await analyzeIssue(b64, 'temp_' + Date.now());
        setAnalysis(result);
        setStep(3);
      } catch (err) {
        console.error('[Gemini]:', err);
        setGeminiError(true);
        setStep(3);
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!user) { setToast({ msg: 'Please sign in first', type: 'error' }); return; }
    // Guard rail (defense in depth — UI already blocks this) — never store a
    // report the AI flagged as non-civic or low-confidence.
    if (isReportBlocked(analysis)) {
      setToast({ msg: analysis?.reject_reason || MESSAGES.notCivic, type: 'error' });
      return;
    }
    // Field validation with a specific, friendly message.
    const v = validateReport({
      base64, videoFile, mediaMode,
      address: editableAddress || locationText || '',
      socialConsent, xHandle,
    });
    if (!v.ok) { setToast({ msg: v.message, type: 'error' }); return; }
    setSubmitting(true);
    setError(null);
    try {
      // 1) Media handling — photo and video are mutually exclusive (mode toggle).
      //    Photo: compressed base64 stored inline in Firestore (free Spark plan, no
      //    Cloud Storage), kept well under the 1 MiB doc limit.
      //    Video: too large for inline base64, so it uploads to Cloudinary and we
      //    store only the returned URL.
      let photoUrl = '';
      let videoUrl = null;
      let videoDuration = null;
      if (mediaMode === 'video' && videoFile) {
        try {
          const up = await withTimeout(uploadVideo(videoFile), 30000, 'Video upload');
          videoUrl = up.url;
          videoDuration = up.duration ?? null;
        } catch (vidErr) {
          console.error('[Video upload]:', vidErr);
          setToast({ msg: 'Video upload failed. Check connection and try again.', type: 'error' });
          return; // finally{} resets submitting; user keeps their analysis to retry
        }
      } else if (base64) {
        try {
          const compact = await compressImage(base64, 720, 0.5);
          const dataUrl = `data:image/jpeg;base64,${compact}`;
          if (dataUrl.length < 900000) photoUrl = dataUrl;
          else console.error('[Photo]: compressed image too large to store inline, skipping');
        } catch (imgErr) {
          console.error('[Photo]:', imgErr);
        }
      }

      const finalAddress = editableAddress || locationText || 'Location not available';
      const cityName = finalAddress.includes('Bangalore') || finalAddress.includes('Bengaluru') ? 'Bangalore' :
        finalAddress.includes('Mumbai') ? 'Mumbai' :
        finalAddress.includes('Delhi') ? 'Delhi' : 'Other';
      // Tag the issue to the reporter's saved affiliation (set in Onboarding/Profile),
      // and the reporter is already tagged via that affiliation on their profile.
      const aff = userProfile?.affiliation;
      const adoptedBy = aff?.orgId
        ? { id: aff.orgId, name: aff.orgName, type: aff.orgType }
        : null;
      // Auto-tag the responsible elected representative from the SAME location the issue
      // is saved with (GPS → ward → representative). No user input.
      const wardInfo = getWardRepresentative(
        (pickedLocation || location)?.lat,
        (pickedLocation || location)?.lng
      );
      const complaintId = generateComplaintId(cityName);
      const complaintText = buildComplaintLetter({
        name: user.displayName || userProfile?.displayName || 'Citizen',
        contact: user.email || '',
        address: finalAddress,
        issueType: analysis?.issue_type || manualType,
        severity: analysis?.severity || manualSeverity,
        department: analysis?.department || '',
        body: analysis?.complaint_text || '',
      });

      const issueData = {
        userId: user.uid,
        userName: user.displayName || 'Citizen',
        userPhoto: user.photoURL || null,
        userEmail: user.email || '',
        complaintId,
        photoUrl,
        mediaType: mediaMode,
        videoUrl,
        videoDuration,
        issueType: analysis?.issue_type || manualType,
        severity: analysis?.severity || manualSeverity,
        description: analysis?.description || manualDesc || 'Civic issue reported',
        department: analysis?.department || '',
        complaintText,
        legalRight: analysis?.legal_right || '',
        isGenuine: analysis?.is_genuine ?? true,
        confidence: analysis?.confidence || 0,
        tags: analysis?.tags || ['#JanaShakti'],
        isDuplicate: false,
        originalIssueId: null,
        location: pickedLocation || location || { lat: 12.9716, lng: 77.5946 },
        locationText: finalAddress,
        city: cityName,
        adoptedBy,
        ward: '',
        wardInfo: wardInfo || null,
        status: 'Reported',
        statusHistory: [{ status: 'Reported', changedAt: new Date().toISOString(),
                          changedBy: user.uid, note: 'Initial report' }],
        confirmations: 1,
        confirmedBy: [user.uid],
        pressureScore: 10,
        escalationLevel: 0,
        wallOfShame: false,
        isRecurring: false,
        recurringCount: 0,
        previousReportIds: [],
        socialConsent,
        userXHandle: xHandle,
        xPosted: false,
        xPostUrl: null,
        linkedinPosted: false,
        linkedinPostUrl: null,
        socialReach: 0,
        resolutionPhotoUrl: null,
        resolutionVerified: false,
        resolutionGenuine: false,
        resolvedAt: null,
        rtiGenerated: false,
        rtiDocUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 2) Orchestrate the 4-agent pipeline (duplicate → save → route → predict).
      //    The orchestrator streams a live reasoning trace into the overlay, passes
      //    each agent's output into the next, and persists routedTo + prediction.
      setAgentSteps([]);
      const run = await orchestrateIssue({
        analysis,
        issueData,
        tempId: 'temp',
        onStep: setAgentSteps,
        saveIssue: async (data) =>
          (await withTimeout(addDoc(collection(db, 'issues'), data), 15000, 'Save')).id,
      });

      // Duplicate path — orchestrator detected it before saving; confirm + redirect.
      if (run.duplicate?.isDuplicate && run.duplicate.existingIssueId) {
        const dupResult = run.duplicate;
        // Atomic confirm — one contribution per user, race-safe social trigger.
        const res = await confirmIssue(dupResult.existingIssueId, user.uid);
        if (res.alreadyConfirmed) {
          setToast({ msg: "You've already reported this issue", type: 'info' });
          setTimeout(() => navigate(`/issue/${dupResult.existingIssueId}`), 1500);
          return;
        }
        // A duplicate report from a new on-site witness counts as a verification (+5).
        try {
          // setDoc+merge (not updateDoc) so it still works if the user doc is missing.
          await setDoc(doc(db, 'users', user.uid), {
            civicScore: increment(CIVIC_SCORE_POINTS.VERIFY_ISSUE),
            issuesVerified: increment(1),
          }, { merge: true });
          await bumpPublicProfile(user.uid, { civicScore: CIVIC_SCORE_POINTS.VERIFY_ISSUE });
        } catch (creditErr) {
          console.error('[DupCredit]:', creditErr);
        }
        // Fires for exactly one contributor (the 5th), guarded inside the transaction.
        if (res.shouldPost) {
          const ex = res.issue;
          triggerN8N('social_post', {
            issueId: dupResult.existingIssueId,
            issueType: ex.issueType,
            severity: ex.severity,
            location: ex.locationText,
            description: ex.description,
            photoUrl: ex.photoUrl,
            confirmations: res.newCount,
            socialConsent: ex.socialConsent,
            userXHandle: ex.userXHandle,
          }).catch((e) => console.error('[Social]:', e));
        }
        setToast({ msg: 'Already reported nearby — your confirmation counted! (+5)', type: 'info' });
        setTimeout(() => navigate(`/issue/${dupResult.existingIssueId}`), 1500);
        return;
      }

      const docId = run.docId;

      // 3) Update civic score (critical-ish — wrapped so it can't block navigation)
      try {
        // setDoc+merge (not updateDoc) so the score/count still apply even if the
        // user doc is missing (e.g. profile not yet created) — increment treats a
        // missing field as 0 and the merge creates the doc.
        await setDoc(doc(db, 'users', user.uid), {
          civicScore: increment(CIVIC_SCORE_POINTS.REPORT_ISSUE),
          issuesReported: increment(1),
          // Per-type tally powers the ESG "Water Warrior" badge. Nested map + merge:true
          // so the increment lands on issuesByType.<type> (not a literal dotted key).
          issuesByType: { [issueData.issueType]: increment(1) },
          lastActiveDate: new Date().toISOString().split('T')[0],
        }, { merge: true });
        await bumpPublicProfile(user.uid, { civicScore: CIVIC_SCORE_POINTS.REPORT_ISSUE, issuesReported: 1 });
      } catch (scoreErr) {
        console.error('[CivicScore]:', scoreErr);
      }

      // Org leaderboard stats are computed live from issues (utils/orgStats.js),
      // so there's no per-org counter to bump on report.

      // 4) Success — routing & prediction already ran and persisted inside the
      //    orchestrated pipeline above; just confirm and advance the user.
      setToast({ msg: `+10 pts! Complaint ${complaintId} filed`, type: 'success' });
      setTimeout(() => navigate('/map'), 1800);

      // Best-effort, fire-and-forget (never awaited — must not stall the flow)
      triggerN8N('issue_intelligence', {
        issueId: docId,
        complaintId: issueData.complaintId,
        issueType: issueData.issueType,
        severity: issueData.severity,
        location: issueData.locationText,
        description: issueData.description,
        photoUrl,
        reporterName: user.displayName || 'Citizen',
        confirmations: 1,
        issueUrl: `${window.location.origin}/issue/${docId}`,
      }).catch((e) => console.error('[IssueIntel]:', e));

      if (shouldAutoPost({ ...issueData, confirmations: 1 })) {
        triggerN8N('social_post', {
          issueId: docId,
          issueType: issueData.issueType,
          severity: issueData.severity,
          location: issueData.locationText,
          description: issueData.description,
          photoUrl,
          confirmations: 1,
          socialConsent,
          userXHandle: xHandle,
        }).catch((e) => console.error('[Social]:', e));
      }
    } catch (err) {
      console.error('[Submit]:', err);
      setError(err.message);
      setToast({ msg: 'Failed to submit. Try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── STEP 1: CAPTURE ──
  if (step === 1) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: s === step ? '#00d4ff' : '#1a2f4a',
              }} />
            ))}
          </div>
        </div>
        {/* Photo / Video mode toggle */}
        <div style={{ display: 'flex', gap: '4px', margin: '0 16px',
                      backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
                      borderRadius: '12px', padding: '4px' }}>
          {[{ key: 'photo', label: 'Photo', Icon: Camera },
            { key: 'video', label: 'Video', Icon: Video }].map(({ key, label, Icon }) => {
            const active = mediaMode === key;
            return (
              <button key={key} onClick={() => setMediaMode(key)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '6px', padding: '10px', borderRadius: '9px', cursor: 'pointer',
                border: 'none', fontSize: '13px', fontWeight: '600',
                backgroundColor: active ? '#00d4ff' : 'transparent',
                color: active ? '#04091a' : '#94a3b8',
              }}>
                <Icon size={16} strokeWidth={1.5} /> {label}
              </button>
            );
          })}
        </div>
        <div onClick={() => cameraRef.current?.click()} style={{
          margin: '24px 16px', backgroundColor: '#0d1b2e',
          border: '1px dashed #1a2f4a', borderRadius: '14px',
          padding: '60px 24px', textAlign: 'center', cursor: 'pointer',
        }}>
          {mediaMode === 'video'
            ? <Video size={48} color="#00d4ff" strokeWidth={1} style={{ marginBottom: '16px' }} />
            : <Camera size={48} color="#00d4ff" strokeWidth={1} style={{ marginBottom: '16px' }} />}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f0f6ff',
                       marginBottom: '8px' }}>Tap to report an issue</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            {mediaMode === 'video' ? `Record a clip — max ${MAX_VIDEO_DURATION}s` : 'Opens your camera'}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => galleryRef.current?.click()} style={{
            background: 'none', border: 'none', color: '#00d4ff',
            fontSize: '13px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: '4px', margin: '0 auto',
          }}>
            <Image size={14} strokeWidth={1.5} /> Choose {mediaMode === 'video' ? 'video' : 'photo'} from gallery
          </button>
        </div>
        {/* Camera: capture forces the rear camera on mobile/iOS; accept follows the mode */}
        <input ref={cameraRef} type="file"
          accept={mediaMode === 'video' ? 'video/*' : 'image/*'} capture="environment"
          onChange={handleMedia} style={{ display: 'none' }} />
        {/* Gallery: no capture → opens the library / file picker */}
        <input ref={galleryRef} type="file"
          accept={mediaMode === 'video' ? 'video/*' : 'image/*'}
          onChange={handleMedia} style={{ display: 'none' }} />
      </div>
    );
  }

  // ── STEP 2: ANALYZING ──
  if (step === 2 && analyzing) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: '#04091a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          width: '60px', height: '60px',
          border: '3px solid #1a2f4a', borderTop: '3px solid #00d4ff',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          marginBottom: '24px',
        }} />
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f0f6ff',
                     marginBottom: '8px' }}>Gemini AI is analyzing...</h3>
        <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center',
                    marginBottom: '16px' }}>
          Identifying issue type, severity &amp; legal rights
        </p>
        <p style={{ fontSize: '11px', color: '#86efac' }}>
          Powered by Google AI Studio
        </p>
      </div>
    );
  }

  // ── STEP 3: RESULTS ──
  const inputStyle = {
    width: '100%', backgroundColor: '#112035', color: '#f0f6ff',
    border: '0.5px solid #1a2f4a', borderRadius: '10px',
    padding: '12px 14px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  // Live, personalized complaint letter — recomputed from current state
  const complaintLetter = buildComplaintLetter({
    name: user?.displayName || userProfile?.displayName || 'Citizen',
    contact: user?.email || '',
    address: editableAddress || locationText,
    issueType: analysis?.issue_type || manualType,
    severity: analysis?.severity || manualSeverity,
    department: analysis?.department || '',
    body: analysis?.complaint_text || '',
  });

  const blocked = isReportBlocked(analysis);

  // ── STEP 3 (blocked): AI judged this is not a civic issue → hard stop ──
  if (blocked) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
        <div style={{ padding: '16px' }}>
          {(photo || videoPreview) && (
            videoPreview ? (
              <video src={videoPreview} controls muted playsInline style={{
                width: '100%', height: '180px', objectFit: 'cover',
                borderRadius: '14px', backgroundColor: '#04091a', marginBottom: '16px',
              }} />
            ) : (
              <img src={photo} alt="Issue" style={{
                width: '100%', height: '180px', objectFit: 'cover',
                borderRadius: '14px', marginBottom: '16px',
              }} />
            )
          )}
          <div style={{ backgroundColor: '#ef44441a', border: '0.5px solid #ef444440',
                        borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertTriangle size={18} color="#ef4444" strokeWidth={1.5} />
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff' }}>
                Not a civic issue
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              {analysis?.reject_reason || MESSAGES.notCivic}
            </p>
          </div>
          <button onClick={() => {
              setStep(1); setPhoto(null); setVideoFile(null); setVideoPreview(null);
              setBase64(null); setAnalysis(null); setGeminiError(false);
            }}
            style={{
              width: '100%', padding: '14px', backgroundColor: '#00d4ff',
              color: '#04091a', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            }}>Retake</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e', paddingBottom: '72px' }}>
      <AgentPipelineOverlay steps={agentSteps} visible={submitting && agentSteps.length > 0} />
      <div style={{ padding: '16px' }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: s <= step ? '#00d4ff' : '#1a2f4a',
            }} />
          ))}
        </div>

        {/* Media preview (photo or video) */}
        {(photo || videoPreview) && (
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            {videoPreview ? (
              <video src={videoPreview} controls muted playsInline style={{
                width: '100%', height: '180px', objectFit: 'cover',
                borderRadius: '14px', backgroundColor: '#04091a',
              }} />
            ) : (
              <img src={photo} alt="Issue" style={{
                width: '100%', height: '180px', objectFit: 'cover',
                borderRadius: '14px',
              }} />
            )}
            <button onClick={() => {
                setStep(1); setPhoto(null); setVideoFile(null); setVideoPreview(null);
                setAnalysis(null); setGeminiError(false);
              }}
              style={{
                position: 'absolute', top: '8px', right: '8px',
                background: 'rgba(4,9,26,0.8)', border: 'none',
                color: '#00d4ff', fontSize: '11px', padding: '4px 10px',
                borderRadius: '8px', cursor: 'pointer',
              }}>Change {videoPreview ? 'Video' : 'Photo'}</button>
          </div>
        )}

        {/* Manual fallback if Gemini failed */}
        {geminiError && !analysis && (
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                        border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: '#f97316', marginBottom: '12px' }}>
              AI analysis unavailable. Please fill in manually:
            </p>
            <select value={manualType} onChange={e => setManualType(e.target.value)}
              style={{ ...inputStyle, marginBottom: '10px' }}>
              {ISSUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={manualSeverity} onChange={e => setManualSeverity(e.target.value)}
              style={{ ...inputStyle, marginBottom: '10px' }}>
              {SEVERITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <textarea value={manualDesc} onChange={e => setManualDesc(e.target.value)}
              placeholder="Describe the issue..." rows={3}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        )}

        {/* AI Results */}
        {analysis && (
          <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                        border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff' }}>
                {analysis.issue_type}
              </span>
              <SeverityBadge severity={analysis.severity} />
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6,
                        marginBottom: '12px' }}>
              {analysis.description}
            </p>

            {/* Agent pipeline pills */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {['Analyzed', 'Checked', 'Routing'].map((label, i) => (
                <span key={label} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '999px', fontSize: '10px',
                  fontWeight: '600',
                  backgroundColor: ['#00d4ff1a', '#16a34a1a', '#f973161a'][i],
                  color: ['#00d4ff', '#16a34a', '#f97316'][i],
                }}>
                  <CheckCircle size={10} strokeWidth={2} /> {label}
                </span>
              ))}
            </div>

            {/* Complaint letter — personalized & live */}
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => setShowComplaint(!showComplaint)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', background: 'none', border: 'none',
                color: '#f0f6ff', cursor: 'pointer', padding: '8px 0',
              }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Complaint Letter</span>
                {showComplaint ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showComplaint && (
                <div style={{ backgroundColor: '#112035', borderRadius: '10px',
                              padding: '12px', position: 'relative' }}>
                  <button onClick={() => {
                    navigator.clipboard.writeText(complaintLetter);
                    setToast({ msg: 'Copied to clipboard!', type: 'info' });
                  }} style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                    <Copy size={14} color="#4a6280" strokeWidth={1.5} />
                  </button>
                  <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6,
                              whiteSpace: 'pre-wrap' }}>{complaintLetter}</p>
                </div>
              )}
            </div>

            {/* Legal right */}
            {analysis.legal_right && (
              <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '12px',
                            marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <Scale size={14} color="#3b82f6" strokeWidth={1.5} />
                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#3b82f6',
                                 textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Your Legal Right
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#7ee8fa', lineHeight: 1.5 }}>
                  {analysis.legal_right}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Social Consent */}
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                      border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff',
                      marginBottom: '10px' }}>Post on @JanaShaktiApp?</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['tag', 'Tag me'], ['anonymous', 'Anonymous'], ['none', "Don't post"]].map(([val, label]) => (
              <button key={val} onClick={() => setSocialConsent(val)} style={{
                flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px',
                fontWeight: '600', cursor: 'pointer',
                backgroundColor: socialConsent === val ? '#00d4ff20' : 'transparent',
                color: socialConsent === val ? '#00d4ff' : '#94a3b8',
                border: socialConsent === val ? '1px solid #00d4ff' : '0.5px solid #1a2f4a',
              }}>{label}</button>
            ))}
          </div>
          {socialConsent === 'tag' && (
            <input value={xHandle} onChange={e => setXHandle(e.target.value)}
              placeholder="@username" style={{ ...inputStyle, marginTop: '10px' }} />
          )}
        </div>

        {/* Editable location */}
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px',
                      border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={16} color="#16a34a" strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>
                Issue Location
              </span>
            </div>
            {accuracy != null && (
              <span style={{
                fontSize: '10px', fontWeight: '600',
                color: accuracy <= 30 ? '#16a34a' : accuracy <= 100 ? '#eab308' : '#f97316',
              }}>
                ±{Math.round(accuracy)}m {accuracy <= 30 ? '· precise' : '· refining…'}
              </span>
            )}
          </div>
          <textarea
            value={editableAddress}
            onChange={(e) => { addressTouched.current = true; setEditableAddress(e.target.value); }}
            placeholder="Address of the issue..."
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: '10px' }}
          />
          <LocationPicker
            value={pickedLocation}
            onChange={(latlng, address) => {
              locationTouched.current = true;
              addressTouched.current = true;
              setPickedLocation(latlng);
              setEditableAddress(address);
            }}
          />
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          style={{
            width: '100%', padding: '14px', backgroundColor: submitting ? '#00a8cc' : '#00d4ff',
            color: '#04091a', border: 'none', borderRadius: '10px',
            fontSize: '14px', fontWeight: '600', cursor: submitting ? 'wait' : 'pointer',
          }}>
          {submitting
            ? (mediaMode === 'video' ? 'Uploading video...' : 'Submitting...')
            : 'Submit Report'}
        </button>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center',
                      marginTop: '10px' }}>{error}</p>
        )}
      </div>
    </div>
  );
}
