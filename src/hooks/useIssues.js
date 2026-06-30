import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit,
         onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';

// Server-side ordered query. The filter+createdAt combos are backed by the
// composite indexes in firestore.indexes.json (userId / severity / status / contributedUids × createdAt).
// `contributorUid` filters to issues the user has contributed to (array-contains on
// `contributedUids`) — used by the notification feed. Pass a sentinel (e.g. 'none') rather
// than a falsy value so a signed-out caller matches nothing instead of the global feed.
export function useIssues({ userId, severity, status, contributorUid, limitCount = 20 } = {}) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const constraints = [];
      if (userId) constraints.push(where('userId', '==', userId));
      if (severity) constraints.push(where('severity', '==', severity));
      if (status) constraints.push(where('status', '==', status));
      if (contributorUid) constraints.push(where('contributedUids', 'array-contains', contributorUid));
      constraints.push(orderBy('createdAt', 'desc'), limit(limitCount));

      const q = query(collection(db, 'issues'), ...constraints);

      const unsub = onSnapshot(q,
        (snap) => {
          setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
          console.error('[useIssues]:', err);
        }
      );
      return unsub;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      console.error('[useIssues]:', err);
    }
  }, [userId, severity, status, contributorUid, limitCount]);

  return { issues, loading, error };
}
