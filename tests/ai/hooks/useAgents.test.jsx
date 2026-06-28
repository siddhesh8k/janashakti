import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgents } from '../../../src/hooks/useAgents';
import { getCountFromServer, getDocs } from 'firebase/firestore'; // Import to access the globally mocked functions

// Spy on console.error to catch and assert any errors logged by the hook
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('useAgents', () => {
  // Store original mock implementations to restore them after each test.
  // This assumes getCountFromServer and getDocs are already vi.fn() from global setup.js.
  let originalGetCountFromServerImpl;
  let originalGetDocsImpl;

  beforeEach(() => {
    // Clear any previous calls to console.error
    consoleErrorSpy.mockClear();

    // Store the current (default from setup.js) implementations of the mocked functions
    originalGetCountFromServerImpl = getCountFromServer.getMockImplementation();
    originalGetDocsImpl = getDocs.getMockImplementation();

    // Reset mocks to their default behavior from setup.js for each test
    // This ensures test isolation, especially if a test overrides them.
    getCountFromServer.mockImplementation(originalGetCountFromServerImpl);
    getDocs.mockImplementation(originalGetDocsImpl);
  });

  afterEach(() => {
    // Restore mocks to their original implementations after each test
    getCountFromServer.mockImplementation(originalGetCountFromServerImpl);
    getDocs.mockImplementation(originalGetDocsImpl);
  });

  afterAll(() => {
    // Restore the original console.error after all tests are done
    consoleErrorSpy.mockRestore();
  });

  it('should return initial state correctly', () => {
    const { result } = renderHook(() => useAgents());

    // Assert initial loading state
    expect(result.current.loading).toBe(true);

    // Assert initial stats object shape and default values
    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
    });

    // Assert initial recentRuns array is empty
    expect(result.current.recentRuns).toEqual([]);
  });

  it('should set loading to false after data fetch completes with default mocked responses', async () => {
    const { result } = renderHook(() => useAgents());

    // Initially loading should be true
    expect(result.current.loading).toBe(true);

    // Wait for the async operations in useEffect to complete and loading to become false
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Ensure no errors were logged during a successful (though empty) fetch
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return default data shapes and values after fetch with mocked empty responses', async () => {
    const { result } = renderHook(() => useAgents());

    // Wait for the hook to finish loading
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Assert stats structure and default values (0 from mocked getCountFromServer in setup.js)
    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
    });

    // Assert recentRuns structure and default values (empty array from mocked getDocs in setup.js)
    expect(result.current.recentRuns).toEqual([]);
  });

  it('should handle errors during agent_runs fetch gracefully and log them', async () => {
    // Mock getDocs to throw an error for its next call (which is for 'agent_runs')
    getDocs.mockImplementationOnce(() => {
      return Promise.reject(new Error('Failed to fetch agent_runs'));
    });

    const { result } = renderHook(() => useAgents());

    // Wait for the hook to finish loading (even with an error, finally block sets loading to false)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Expect console.error to have been called due to the mocked error in the 'agent_runs' block
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useAgents/runs]:',
      expect.any(Error)
    );
    expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Failed to fetch agent_runs');

    // Ensure other parts of the state are still correctly handled
    // Stats should still be 0 as getCountFromServer was not mocked to fail
    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
    });
    // recentRuns should remain an empty array as the catch block handles the error
    expect(result.current.recentRuns).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should handle errors during getCountFromServer fetch gracefully and log them', async () => {
    // Mock getCountFromServer to throw an error for all its calls within this test
    getCountFromServer.mockImplementation(() => {
      return Promise.reject(new Error('Failed to fetch counts'));
    });

    const { result } = renderHook(() => useAgents());

    // Wait for the hook to finish loading
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Expect console.error to have been called due to the mocked error in the main try block
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useAgents]:',
      expect.any(Error)
    );
    expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Failed to fetch counts');

    // Ensure state remains at initial defaults as the fetch failed
    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
    });
    // recentRuns should still be an empty array as its fetch might not have been attempted
    // or would have used the default mock if it was.
    expect(result.current.recentRuns).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});