import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getCountFromServer, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

export function useAgents() {
  const [stats, setStats] = useState({
    analyzed: 0, duplicatesCaught: 0,
    authoritiesNotified: 0, predictionsGenerated: 0, resolutionsVerified: 0,
  });
  const [recentRuns, setRecentRuns] = useState([]); // latest orchestrated pipeline runs (with step traces)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Count with aggregation queries (server-side) instead of downloading every
        // matching agents_log doc — with hundreds of issues that was ~2,000 doc reads.
        const col = collection(db, 'agents_log');
        const countOf = (name) =>
          getCountFromServer(query(col, where('agentName', '==', name), where('success', '==', true)));
        const [a, d, r, p, v] = await Promise.all([
          countOf('issue_analyzer'),
          countOf('duplicate_detector'),
          countOf('authority_router'),
          countOf('resolution_predictor'),
          countOf('resolution_verifier'),
        ]);
        setStats({
          analyzed: a.data().count,
          duplicatesCaught: d.data().count,
          authoritiesNotified: r.data().count,
          predictionsGenerated: p.data().count,
          resolutionsVerified: v.data().count,
        });

        // Recent pipeline runs with their per-agent reasoning traces. Best-effort:
        // an empty/missing collection (no runs yet) must not break the screen.
        try {
          const runsSnap = await getDocs(
            query(collection(db, 'agent_runs'), orderBy('createdAt', 'desc'), limit(10)),
          );
          setRecentRuns(runsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        } catch (runErr) {
          console.error('[useAgents/runs]:', runErr);
        }
      } catch (e) {
        console.error('[useAgents]:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  return { stats, recentRuns, loading };
}
