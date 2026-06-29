import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Live view of an issue's contributor-uploaded evidence (newest first). [] until loaded.
export function useIssueEvidence(issueId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!issueId) { setLoading(false); return; }
    const q = query(collection(db, 'issues', issueId, 'evidence'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('[useIssueEvidence]:', err); setLoading(false); },
    );
    return unsub;
  }, [issueId]);

  return { items, loading };
}
