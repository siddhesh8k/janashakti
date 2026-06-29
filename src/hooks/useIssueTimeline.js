import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Live (onSnapshot) view of an issue's append-only collaboration timeline,
// oldest-first (GitHub-style). Returns [] until loaded; never throws.
export function useIssueTimeline(issueId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!issueId) { setLoading(false); return; }
    const q = query(collection(db, 'issues', issueId, 'timeline'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => { setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('[useIssueTimeline]:', err); setLoading(false); },
    );
    return unsub;
  }, [issueId]);

  return { events, loading };
}
