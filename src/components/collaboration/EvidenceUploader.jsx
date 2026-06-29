import { useState, useRef } from 'react';
import { Paperclip, X, UploadCloud } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ToastProvider';
import { compressImage } from '../../utils/gemini';
import { uploadEvidence, isContributor } from '../../utils/collaboration';

const EVIDENCE_TYPES = ['photo', 'receipt', 'document', 'rti_response'];
const MAX_PER_USER = 5; // loophole #2: cap evidence per contributor per issue

const fileToRawBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

// Contributor-only evidence uploader. Compresses to base64 (no Cloud Storage), runs the
// Gemini-Vision relevance gate (points only on accept), caps at 5/issue.
export default function EvidenceUploader({ issue, events = [] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('photo');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  if (!issue?.id || !user?.uid) return null;
  if (!isContributor(issue, user.uid) && issue.userId !== user.uid) return null; // contributors + reporter

  const mine = events.filter((e) => e.userId === user.uid && e.action === 'evidence_uploaded').length;
  const atCap = mine >= MAX_PER_USER;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (atCap) { toast.show(`Evidence cap reached (${MAX_PER_USER}/issue)`, 'error'); return; }
    setBusy(true);
    try {
      const raw = await fileToRawBase64(file);
      const compressed = await compressImage(raw, 800, 0.5);
      const res = await uploadEvidence(issue.id, user, {
        imageBase64: compressed, type, caption, issueType: issue.issueType,
      });
      if (res?.ok) {
        toast.show(res.relevant ? 'Evidence added · +15 reputation' : 'Evidence saved, but it didn’t look relevant — no points awarded', res.relevant ? 'success' : 'info');
        setOpen(false); setCaption('');
      } else {
        toast.show(res?.error || 'Upload failed', 'error');
      }
    } catch (err) {
      console.error('[EvidenceUploader]:', err);
      toast.show('Could not read that file', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none',
          border: '0.5px solid #00d4ff', borderRadius: '10px', padding: '10px 14px',
          color: '#00d4ff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <Paperclip size={15} strokeWidth={1.5} /> Add evidence
        </button>
      ) : (
        <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Add evidence</span>
            <button onClick={() => !busy && setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={18} color="#4a6280" />
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {EVIDENCE_TYPES.map((t) => {
              const active = t === type;
              return (
                <button key={t} onClick={() => setType(t)} style={{
                  padding: '6px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                  textTransform: 'capitalize',
                  backgroundColor: active ? '#112035' : 'transparent',
                  color: active ? '#00d4ff' : '#4a6280', border: '0.5px solid #1a2f4a' }}>
                  {t.replace('_', ' ')}
                </button>
              );
            })}
          </div>

          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (e.g. BMC complaint receipt)"
            style={{ width: '100%', backgroundColor: '#112035', color: '#f0f6ff', border: '0.5px solid #1a2f4a',
              borderRadius: '10px', padding: '11px 13px', fontSize: '13px', outline: 'none', marginBottom: '12px' }} />

          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy || atCap} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            backgroundColor: (busy || atCap) ? '#1a2f4a' : '#00d4ff', color: '#04091a', border: 'none',
            borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700',
            cursor: (busy || atCap) ? 'default' : 'pointer' }}>
            <UploadCloud size={16} strokeWidth={2} /> {busy ? 'Checking & uploading…' : atCap ? `Cap reached (${MAX_PER_USER})` : 'Choose image & upload'}
          </button>
          <p style={{ fontSize: '10px', color: '#4a6280', marginTop: '8px', lineHeight: 1.4 }}>
            AI checks each image is relevant to the issue before awarding points. {MAX_PER_USER - mine} of {MAX_PER_USER} uploads left.
          </p>
        </div>
      )}
    </div>
  );
}
