import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ToastProvider';
import { postUpdate, isContributor } from '../../utils/collaboration';

// Contributor-only text composer to post a progress update to the activity timeline.
export default function UpdateComposer({ issue }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!issue?.id || !user?.uid) return null;
  if (!isContributor(issue, user.uid) && issue.userId !== user.uid) return null;

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await postUpdate(issue.id, user, text);
    if (res?.ok) { toast.show('Update posted · +10 reputation', 'success'); setText(''); }
    else toast.show(res?.error || 'Could not post update', 'error');
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Post a progress update…"
        maxLength={280}
        style={{ flex: 1, backgroundColor: '#112035', color: '#f0f6ff', border: '0.5px solid #1a2f4a',
          borderRadius: '10px', padding: '11px 13px', fontSize: '13px', outline: 'none' }}
      />
      <button onClick={submit} disabled={busy || !text.trim()} title="Post update" style={{
        backgroundColor: (busy || !text.trim()) ? '#1a2f4a' : '#00d4ff', color: '#04091a', border: 'none',
        borderRadius: '10px', padding: '0 15px', cursor: (busy || !text.trim()) ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center' }}>
        <Send size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
