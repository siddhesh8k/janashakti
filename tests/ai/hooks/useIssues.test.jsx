import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useIssues } from '../../../src/hooks/useIssues';
import { onSnapshot } from 'firebase/firestore'; // Import the mocked version

describe('useIssues', () => {
  // Ensure onSnapshot is reset to its default mocked behavior (success with empty data)
  // before each test, unless a test specifically overrides it.
  // NOTE: The mock invokes the success callback SYNCHRONOUSLY during the effect,
  // so by the time renderHook returns, loading is already false.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((q, successCallback) => {
      successCallback({ docs: [] });
      return vi.fn(); // Return a mock unsubscribe function
    });
  });

  it('should return the expected shape and default empty data after loading', async () => {
    const { result } = renderHook(() => useIssues());

    // The mocked onSnapshot fires synchronously, so loading settles to false.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.issues).toEqual([]);
      expect(result.current.error).toBe(null);
    });
  });

  it('should handle userId prop correctly and return empty data', async () => {
    const { result } = renderHook(() => useIssues({ userId: 'test-user-id-123' }));

    // Wait for the async operation
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.issues).toEqual([]);
      expect(result.current.error).toBe(null);
    });
  });

  it('should handle multiple filter props (userId, severity, status, limitCount) and return empty data', async () => {
    const { result } = renderHook(() =>
      useIssues({
        userId: 'another-user-id',
        severity: 'high',
        status: 'open',
        limitCount: 5,
      })
    );

    // Wait for the async operation
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.issues).toEqual([]);
      expect(result.current.error).toBe(null);
    });
  });

  it('should handle errors from onSnapshot and set the error state', async () => {
    const errorMessage = 'Simulated Firestore error during snapshot';
    // Override the mocked onSnapshot to call the error callback instead of success
    vi.mocked(onSnapshot).mockImplementationOnce((q, successCallback, errorCallback) => {
      errorCallback(new Error(errorMessage));
      return vi.fn(); // Return a mock unsubscribe function
    });

    const { result } = renderHook(() => useIssues());

    // Wait for the async operation (onSnapshot error callback)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.issues).toEqual([]); // Issues should still be empty on error
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it('should unsubscribe from Firestore on unmount', async () => {
    const mockUnsubscribe = vi.fn();
    // Override onSnapshot to return our specific mockUnsubscribe function
    vi.mocked(onSnapshot).mockImplementationOnce((q, successCallback) => {
      successCallback({ docs: [] }); // Still call success for initial state
      return mockUnsubscribe;
    });

    const { result, unmount } = renderHook(() => useIssues());

    // Ensure the effect has run and onSnapshot has been called
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Unmount the hook, which should trigger the cleanup function (unsubscribe)
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
