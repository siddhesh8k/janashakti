import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { ISSUE_TYPES } from '../constants/issueTypes';

// Live organisation stats computed from the real `issues` collection — replaces the
// previously hardcoded org counters so the leaderboard / CSR numbers always match
// the actual issue documents (what a judge would count by hand).
//
// Uses aggregation queries (getCountFromServer), which run server-side and never
// download the inline base64 photos on issue docs, so they stay cheap.

const issuesCol = () => collection(db, 'issues');

// { totalAdopted, resolved } for one org. totalAdopted = issues adopted by the org;
// resolved = those currently Resolved. Returns zeros on any error.
export const getOrgStats = async (orgId) => {
  if (!orgId) return { totalAdopted: 0, resolved: 0 };
  try {
    const [totalSnap, resolvedSnap] = await Promise.all([
      getCountFromServer(query(issuesCol(), where('adoptedBy.id', '==', orgId))),
      getCountFromServer(query(issuesCol(),
        where('adoptedBy.id', '==', orgId), where('status', '==', 'Resolved'))),
    ]);
    return {
      totalAdopted: totalSnap.data().count,
      resolved: resolvedSnap.data().count,
    };
  } catch (err) {
    console.error('[getOrgStats]:', err);
    return { totalAdopted: 0, resolved: 0 };
  }
};

// Top issue types (by count) among an org's adopted issues — for the CSR report.
// Returns up to `limit` type values with a non-zero count, most common first.
export const getOrgTopTypes = async (orgId, limit = 3) => {
  if (!orgId) return [];
  try {
    const counts = await Promise.all(
      ISSUE_TYPES.map(async (t) => {
        const snap = await getCountFromServer(query(issuesCol(),
          where('adoptedBy.id', '==', orgId), where('issueType', '==', t.value)));
        return { type: t.value, count: snap.data().count };
      })
    );
    return counts
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((c) => c.type);
  } catch (err) {
    console.error('[getOrgTopTypes]:', err);
    return [];
  }
};
