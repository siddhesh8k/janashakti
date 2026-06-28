import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUser } from '../../../src/hooks/useUser';
import { onSnapshot } from 'firebase/firestore'; // Import to mock it

// Mock console.error to prevent test output pollution and allow asserting calls
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('useUser', () => {
  // Clear all mocks and console.error spy after each test to ensure isolation
  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
  });

  // Case 1: No UID provided
  it('should return null profile and loading: false when no uid is provided', async () => {
    const { result } = renderHook(() => useUser(null));

    // With no uid the hook short-circuits and flips loading to false.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.profile).toBeNull();
  });

  // Case 2: UID provided, but no data exists
  it('should return null profile and loading: false when uid is provided but no data exists', async () => {
    const testUid = 'user-without-data';

    // Locally mock onSnapshot to emit a snapshot whose doc does not exist.
    const mockUnsubscribe = vi.fn();
    onSnapshot.mockImplementationOnce((docRef, onNext) => {
      setTimeout(() => {
        onNext({ id: testUid, exists: () => false, data: () => ({}) });
      }, 0);
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useUser(testUid));

    // After onSnapshot callback (doc does not exist)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.profile).toBeNull();
  });

  // Case 3: UID provided, and data *does* exist (local mock override)
  it('should return user profile data and loading: false when uid is provided and data exists', async () => {
    const testUid = 'user-with-data';
    const mockUserData = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      avatar: 'http://example.com/avatar.jpg',
    };

    // Locally mock onSnapshot to simulate data existing
    const mockUnsubscribe = vi.fn();
    onSnapshot.mockImplementationOnce((docRef, onNext, onError) => {
      // Simulate async data fetch
      setTimeout(() => {
        onNext({
          id: testUid,
          exists: () => true,
          data: () => mockUserData,
        });
      }, 0); // Use 0ms for immediate async execution in tests
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useUser(testUid));

    // Initial state
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(true);

    // After onSnapshot callback with data
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      // Assert the shape and content of the profile object
      expect(result.current.profile).toEqual({ id: testUid, ...mockUserData });
    });
  });

  // Case 4: Error during snapshot subscription (local mock override)
  it('should return null profile and loading: false when an error occurs during subscription', async () => {
    const testUid = 'user-with-error';
    const mockError = new Error('Firestore subscription failed');

    // Locally mock onSnapshot to simulate an error
    const mockUnsubscribe = vi.fn();
    onSnapshot.mockImplementationOnce((docRef, onNext, onError) => {
      // Simulate async error
      setTimeout(() => {
        onError(mockError);
      }, 0);
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useUser(testUid));

    // Initial state
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(true);

    // After onSnapshot error callback
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.profile).toBeNull();
    // Assert that console.error was called with the expected message and error object
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useUser]:', mockError);
  });

  // Case 5: Unsubscribe from snapshot listener on unmount or uid change
  it('should unsubscribe from snapshot listener when component unmounts or uid changes', async () => {
    const testUid1 = 'user-1';
    const testUid2 = 'user-2';
    const mockUnsubscribe1 = vi.fn();
    const mockUnsubscribe2 = vi.fn();

    // Mock onSnapshot for the first UID
    onSnapshot.mockImplementationOnce((docRef, onNext) => {
      setTimeout(() => {
        onNext({ id: testUid1, exists: () => true, data: () => ({ name: 'User 1' }) });
      }, 0);
      return mockUnsubscribe1;
    });

    const { result, rerender, unmount } = renderHook(({ uid }) => useUser(uid), {
      initialProps: { uid: testUid1 },
    });

    // Wait for initial data fetch for uid1
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile).toEqual({ id: testUid1, name: 'User 1' });
    });

    // Mock onSnapshot for the second UID
    onSnapshot.mockImplementationOnce((docRef, onNext) => {
      setTimeout(() => {
        onNext({ id: testUid2, exists: () => true, data: () => ({ name: 'User 2' }) });
      }, 0);
      return mockUnsubscribe2;
    });

    // Change UID, which should trigger cleanup for the first listener and setup for the second
    rerender({ uid: testUid2 });

    // Expect unsubscribe for uid1 to have been called
    expect(mockUnsubscribe1).toHaveBeenCalledTimes(1);

    // Wait for new data fetch for uid2
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile).toEqual({ id: testUid2, name: 'User 2' });
    });

    // Unmount the component, which should trigger unsubscribe for the second listener
    unmount();
    expect(mockUnsubscribe2).toHaveBeenCalledTimes(1);
  });
});