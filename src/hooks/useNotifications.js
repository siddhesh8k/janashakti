import { useMemo, useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useIssues } from './useIssues';
import { buildNotifications, toIso } from '../utils/notifications';

// Client-side, real-time notification feed (no backend / Cloud Functions). Two-sided:
//   • reporter — events on issues the user CREATED (status, milestones, escalation, social…)
//   • contributor — events on issues the user JOINED (resolved → claim +25, status change,
//     needs-verification vote, evidence/updates by others, removal).
// Derivation is pure (utils/notifications.js); this hook only fetches the inputs.
export function useNotifications(uid) {
  const { issues: owned } = useIssues({ userId: uid, limitCount: 50 });
  // Sentinel 'none' when signed-out → array-contains matches nothing (not the global feed).
  const { issues: joined } = useIssues({ contributorUid: uid || 'none', limitCount: 50 });
  const [activityEvents, setActivityEvents] = useState([]);

  // Stable key so we only refetch timelines when the joined set (or its updatedAt) changes.
  const joinedKey = useMemo(
    () => joined.map((i) => `${i.id}:${toIso(i.updatedAt) || ''}`).join('|'),
    [joined],
  );

  // Activity by OTHER contributors lives in each issue's timeline subcollection — fetch the
  // recent events for the 15 most-recent joined issues (one-shot reads, bounded, best-effort).
  useEffect(() => {
    if (!uid) { setActivityEvents([]); return undefined; }
    const targets = joined.slice(0, 15);
    if (!targets.length) { setActivityEvents([]); return undefined; }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(targets.map(async (iss) => {
        try {
          const snap = await getDocs(query(
            collection(db, 'issues', iss.id, 'timeline'),
            orderBy('createdAt', 'desc'), limit(8),
          ));
          return snap.docs.map((d) => ({ id: d.id, issueId: iss.id, issueType: iss.issueType, ...d.data() }));
        } catch (e) {
          console.error('[useNotifications/timeline]:', e?.message);
          return [];
        }
      }));
      if (!cancelled) setActivityEvents(results.flat());
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, joinedKey]);

  const items = useMemo(
    () => buildNotifications({ ownedIssues: owned, joinedIssues: joined, activityEvents, uid }),
    [owned, joined, activityEvents, uid],
  );

  return { items };
}
