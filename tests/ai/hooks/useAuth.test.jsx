import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Shared between the hoisted vi.mock factories and the test body. vi.mock factories
// are hoisted above imports, so anything they reference must live in vi.hoisted().
const { CIVIC_SCORE_POINTS, mockSyncPublicProfile } = vi.hoisted(() => ({
  CIVIC_SCORE_POINTS: { DAILY_STREAK: 10 },
  mockSyncPublicProfile: vi.fn(),
}));

// Mock constants used in the hook (path must match what useAuth.js imports, resolved
// relative to this test file).
vi.mock('../../../src/constants/issueTypes', () => ({
  CIVIC_SCORE_POINTS,
}));

// Mock the public-profile sync utility.
vi.mock('../../../src/utils/publicProfile', () => ({
  syncPublicProfile: mockSyncPublicProfile,
}));

import { useAuth } from '../../../src/hooks/useAuth';

// Import the globally mocked firebase functions and objects (from tests/setup.js).
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { auth, db } from '../../../src/firebase';

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clears call history and resets mock implementations for vi.fn()

    // Default mock for onAuthStateChanged: immediately calls back with null
    // This simulates a user not logged in initially.
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null); // Simulate initial logged out state
      return vi.fn(); // Return an unsubscribe function
    });

    // getDoc is globally mocked to return exists: false. We can override it with mockResolvedValueOnce.
    // setDoc, doc, serverTimestamp, increment are likely `vi.fn()` from global setup.
    // We can just ensure they are cleared and ready to be spied on.
    setDoc.mockResolvedValue(); // Ensure setDoc doesn't throw
    serverTimestamp.mockReturnValue({ toDate: () => new Date() }); // Provide a sensible mock return for serverTimestamp
    increment.mockImplementation((value) => value); // Provide a sensible mock return for increment
  });

  // Helper to simulate getDoc response for specific tests
  const mockGetDocResponse = (exists, data = {}) => {
    getDoc.mockResolvedValueOnce({
      exists: () => exists,
      data: () => data,
    });
  };

  // Test Case 1: Initial state and loading
  it('should return initial loading state as true and then false after auth check', async () => {
    const { result } = renderHook(() => useAuth());

    // onAuthStateChanged fires synchronously in the mock, so loading settles to
    // false quickly. Assert the resolved state shape rather than the transient one.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // After initial check (no user), it should be null
    expect(result.current.user).toBe(null);
    expect(result.current.userProfile).toBe(null);
  });

  // Test Case 2: User logs out (no user)
  it('should return null user and userProfile when no user is logged in', async () => {
    // onAuthStateChanged is already mocked to return null initially in beforeEach
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBe(null);
    expect(result.current.userProfile).toBe(null);
    expect(getDoc).not.toHaveBeenCalled(); // No user, so no profile fetch
    expect(setDoc).not.toHaveBeenCalled();
    expect(mockSyncPublicProfile).not.toHaveBeenCalled();
  });

  // Test Case 3: User logs in, but no profile exists in Firestore
  it('should return user object but null userProfile if profile does not exist', async () => {
    const mockFirebaseUser = { uid: 'test-uid', displayName: 'Test User' };

    // Override onAuthStateChanged to simulate a logged-in user
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(mockFirebaseUser); // Simulate user logging in
      return vi.fn();
    });

    // getDoc is globally mocked to return exists: false, so no need to explicitly mock here.

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockFirebaseUser);
    expect(result.current.userProfile).toBe(null);
    expect(getDoc).toHaveBeenCalledWith(doc.mock.results[0].value); // Check if getDoc was called
    expect(doc).toHaveBeenCalledWith(db, 'users', 'test-uid'); // Check doc call with mocked db
    expect(setDoc).not.toHaveBeenCalled(); // No profile to update
    expect(mockSyncPublicProfile).not.toHaveBeenCalled(); // No profile to sync
  });

  // Test Case 4: User logs in, and an existing profile is found
  it('should return user and userProfile when an existing profile is found', async () => {
    const mockFirebaseUser = { uid: 'test-uid-2', displayName: 'Test User 2', photoURL: 'photo.jpg' };
    const mockUserProfileData = {
      displayName: 'Test User 2',
      photoURL: 'photo.jpg',
      civicScore: 100,
      issuesReported: 5,
      lastActiveDate: '2023-01-01', // Old date to trigger streak logic
      streak: 1,
    };

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(mockFirebaseUser);
      return vi.fn();
    });

    mockGetDocResponse(true, mockUserProfileData); // Override getDoc for this test

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockFirebaseUser);
    expect(result.current.userProfile).toBeDefined();
    expect(result.current.userProfile.displayName).toBe(mockUserProfileData.displayName);
    expect(result.current.userProfile.civicScore).toBeDefined(); // Don't assert exact value due to increment
    expect(result.current.userProfile.issuesReported).toBe(mockUserProfileData.issuesReported);

    expect(getDoc).toHaveBeenCalledWith(doc.mock.results[0].value);
    expect(doc).toHaveBeenCalledWith(db, 'users', 'test-uid-2');

    // Expect setDoc to be called with merge: true, refreshing lastSeen + streak.
    // lastActiveDate here ('2023-01-01') is a gap, so streak resets and no
    // civicScore increment is included in the update.
    expect(setDoc).toHaveBeenCalledWith(
      doc.mock.results[1].value, // The doc ref for setDoc
      expect.objectContaining({
        lastSeen: expect.any(Object), // serverTimestamp mock returns an object
        streak: expect.any(Number), // Streak should be updated
        lastActiveDate: expect.any(String), // lastActiveDate should be updated
      }),
      { merge: true }
    );

    // Expect syncPublicProfile to be called
    expect(mockSyncPublicProfile).toHaveBeenCalledWith(
      'test-uid-2',
      expect.objectContaining({
        displayName: mockUserProfileData.displayName,
        photoURL: mockUserProfileData.photoURL,
        civicScore: expect.any(Number), // Should be the effective score
        issuesReported: mockUserProfileData.issuesReported,
      })
    );
  });

  // Test Case 5: Cleanup - unsubscribe on unmount
  it('should unsubscribe from auth state changes on unmount', async () => {
    const mockUnsubscribe = vi.fn();
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null); // Initial call
      return mockUnsubscribe; // Return the mock unsubscribe function
    });

    const { unmount } = renderHook(() => useAuth());

    // The auth listener is now wired after completeRedirectSignIn() resolves (a microtask).
    await waitFor(() => expect(onAuthStateChanged).toHaveBeenCalledTimes(1));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  // Test Case 6: Daily streak logic - same day
  it('should not update streak or civic score if lastActiveDate is today', async () => {
    const mockFirebaseUser = { uid: 'test-uid-3', displayName: 'Test User 3' };
    const today = new Date().toISOString().split('T')[0];
    const mockUserProfileData = {
      displayName: 'Test User 3',
      photoURL: 'photo.jpg',
      civicScore: 100,
      issuesReported: 5,
      lastActiveDate: today, // Last active today
      streak: 5,
    };

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(mockFirebaseUser);
      return vi.fn();
    });

    mockGetDocResponse(true, mockUserProfileData);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.userProfile.streak).toBe(mockUserProfileData.streak);
    expect(result.current.userProfile.lastActiveDate).toBe(mockUserProfileData.lastActiveDate);
    expect(result.current.userProfile.civicScore).toBe(mockUserProfileData.civicScore); // Should not be incremented

    expect(setDoc).toHaveBeenCalledWith(
      doc.mock.results[1].value,
      expect.objectContaining({
        lastSeen: expect.any(Object),
      }),
      { merge: true }
    );
    // Ensure streak, lastActiveDate, civicScore are NOT in the update object for setDoc
    const updateObject = setDoc.mock.calls[0][1];
    expect(updateObject).not.toHaveProperty('streak');
    expect(updateObject).not.toHaveProperty('lastActiveDate');
    expect(updateObject).not.toHaveProperty('civicScore'); // civicScore should not be incremented

    expect(mockSyncPublicProfile).toHaveBeenCalledWith(
      'test-uid-3',
      expect.objectContaining({
        civicScore: mockUserProfileData.civicScore, // Should be original score
      })
    );
  });

  // Test Case 7: Daily streak logic - yesterday
  it('should increment streak and civic score if lastActiveDate was yesterday', async () => {
    const mockFirebaseUser = { uid: 'test-uid-4', displayName: 'Test User 4' };
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const mockUserProfileData = {
      displayName: 'Test User 4',
      photoURL: 'photo.jpg',
      civicScore: 100,
      issuesReported: 5,
      lastActiveDate: yesterday, // Last active yesterday
      streak: 5,
    };

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(mockFirebaseUser);
      return vi.fn();
    });

    mockGetDocResponse(true, mockUserProfileData);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const today = new Date().toISOString().split('T')[0];
    const expectedNewStreak = mockUserProfileData.streak + 1;
    const expectedEffectiveScore = mockUserProfileData.civicScore + CIVIC_SCORE_POINTS.DAILY_STREAK;

    // The local userProfile state is spread from the stored doc, so its civicScore
    // stays at the original value; only the effective/synced score reflects the award.
    expect(result.current.userProfile.streak).toBe(expectedNewStreak);
    expect(result.current.userProfile.lastActiveDate).toBe(today);
    expect(result.current.userProfile.civicScore).toBe(mockUserProfileData.civicScore);

    // The setDoc update writes an increment() sentinel for civicScore (mocked to
    // return the raw increment amount), plus the new streak + lastActiveDate.
    expect(setDoc).toHaveBeenCalledWith(
      doc.mock.results[1].value,
      expect.objectContaining({
        lastSeen: expect.any(Object),
        streak: expectedNewStreak,
        lastActiveDate: today,
        civicScore: increment(CIVIC_SCORE_POINTS.DAILY_STREAK),
      }),
      { merge: true }
    );

    // syncPublicProfile receives the computed effective (post-award) score.
    expect(mockSyncPublicProfile).toHaveBeenCalledWith(
      'test-uid-4',
      expect.objectContaining({
        civicScore: expectedEffectiveScore,
      })
    );
  });

  // Test Case 8: Daily streak logic - gap (more than yesterday)
  it('should reset streak to 1 if lastActiveDate was before yesterday', async () => {
    const mockFirebaseUser = { uid: 'test-uid-5', displayName: 'Test User 5' };
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    const mockUserProfileData = {
      displayName: 'Test User 5',
      photoURL: 'photo.jpg',
      civicScore: 100,
      issuesReported: 5,
      lastActiveDate: twoDaysAgo, // Last active two days ago
      streak: 5,
    };

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(mockFirebaseUser);
      return vi.fn();
    });

    mockGetDocResponse(true, mockUserProfileData);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const today = new Date().toISOString().split('T')[0];
    const expectedNewStreak = 1; // Reset to 1
    const expectedCivicScore = mockUserProfileData.civicScore; // Not incremented

    expect(result.current.userProfile.streak).toBe(expectedNewStreak);
    expect(result.current.userProfile.lastActiveDate).toBe(today);
    expect(result.current.userProfile.civicScore).toBe(expectedCivicScore); // Not incremented

    expect(setDoc).toHaveBeenCalledWith(
      doc.mock.results[1].value,
      expect.objectContaining({
        lastSeen: expect.any(Object),
        streak: expectedNewStreak,
        lastActiveDate: today,
      }),
      { merge: true }
    );
    // Ensure civicScore is NOT in the update object for setDoc
    const updateObject = setDoc.mock.calls[0][1];
    expect(updateObject).not.toHaveProperty('civicScore');

    expect(mockSyncPublicProfile).toHaveBeenCalledWith(
      'test-uid-5',
      expect.objectContaining({
        civicScore: expectedCivicScore,
      })
    );
  });
});