import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { CIVIC_SCORE_POINTS } from '../constants/issueTypes';
import { syncPublicProfile } from '../utils/publicProfile';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            // Daily streak: +1 (and +DAILY_STREAK pts) if last active was yesterday,
            // reset to 1 on a gap, no-op if already counted today.
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const update = { lastSeen: serverTimestamp() };
            let effectiveScore = data.civicScore || 0;
            if (data.lastActiveDate !== today) {
              const newStreak = data.lastActiveDate === yesterday ? (data.streak || 0) + 1 : 1;
              update.streak = newStreak;
              update.lastActiveDate = today;
              if (data.lastActiveDate === yesterday) {
                update.civicScore = increment(CIVIC_SCORE_POINTS.DAILY_STREAK);
                effectiveScore += CIVIC_SCORE_POINTS.DAILY_STREAK;
              }
              setUserProfile({ ...data, streak: newStreak, lastActiveDate: today });
            } else {
              setUserProfile(data);
            }
            await setDoc(doc(db, 'users', firebaseUser.uid), update, { merge: true });

            // Self-heal the public leaderboard mirror from the authoritative profile
            // (covers users who predate publicProfiles + the daily-streak award).
            await syncPublicProfile(firebaseUser.uid, {
              displayName: data.displayName,
              photoURL: data.photoURL,
              civicScore: effectiveScore,
              issuesReported: data.issuesReported || 0,
            });
          } else {
            setUserProfile(null);
          }
        } catch (err) {
          console.error('[useAuth]:', err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, userProfile, loading };
}
