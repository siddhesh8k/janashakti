import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgents } from '../../../src/hooks/useAgents';
import { getCountFromServer, getDocs } from 'firebase/firestore';

describe('useAgents', () => {
  // Ensure firebase/firestore functions are mockable and reset before each test.
  // The global setup.js is assumed to have mocked these functions as vi.fn().
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock implementations for Firebase functions
    getCountFromServer.mockReturnValue({ data: () => ({ count: 0 }) });
    getDocs.mockReturnValue({
      docs: [],
      empty: true,
      forEach: vi.fn(),
      size: 0,
    });
  });

  it('should return initial default values', () => {
    const { result } = renderHook(() => useAgents());

    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
      esgScored: 0,
    });
    expect(result.current.recentRuns).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('should set loading to false after data fetch completes', async () => {
    const { result } = renderHook(() => useAgents());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should return default data shapes after fetch with empty Firebase mocks', async () => {
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // With default mocks (getCountFromServer returns 0, getDocs returns empty array)
    expect(result.current.stats).toEqual({
      analyzed: 0,
      duplicatesCaught: 0,
      authoritiesNotified: 0,
      predictionsGenerated: 0,
      resolutionsVerified: 0,
      esgScored: 0,
    });
    expect(result.current.recentRuns).toEqual([]);
  });

  it('should fetch and update stats and recent runs with mocked data', async () => {
    // Mock getCountFromServer for each call in the Promise.all array
    getCountFromServer
      .mockResolvedValueOnce({ data: () => ({ count: 10 }) }) // issue_analyzer
      .mockResolvedValueOnce({ data: () => ({ count: 5 }) })  // duplicate_detector
      .mockResolvedValueOnce({ data: () => ({ count: 3 }) })  // authority_router
      .mockResolvedValueOnce({ data: () => ({ count: 8 }) })  // resolution_predictor
      .mockResolvedValueOnce({ data: () => ({ count: 2 }) })  // resolution_verifier
      .mockResolvedValueOnce({ data: () => ({ count: 1 }) }); // esg_scorer

    // Mock getDocs for agent_runs
    const mockRunDocs = [
      { id: 'run1', data: () => ({ createdAt: new Date(), agentName: 'test_agent_1' }) },
      { id: 'run2', data: () => ({ createdAt: new Date(), agentName: 'test_agent_2' }) },
    ];
    getDocs.mockResolvedValueOnce({
      docs: mockRunDocs,
      empty: false,
      forEach: vi.fn((cb) => mockRunDocs.forEach(cb)),
      size: mockRunDocs.length,
    });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats).toEqual({
      analyzed: 10,
      duplicatesCaught: 5,
      authoritiesNotified: 3,
      predictionsGenerated: 8,
      resolutionsVerified: 2,
      esgScored: 1,
    });

    expect(result.current.recentRuns).toHaveLength(2);
    expect(result.current.recentRuns[0].id).toBe('run1');
    expect(result.current.recentRuns[0].agentName).toBe('test_agent_1');
    expect(result.current.recentRuns[1].id).toBe('run2');
    expect(result.current.recentRuns[1].agentName).toBe('test_agent_2');
  });

  it('should handle errors during recent runs fetch gracefully', async () => {
    // Mock getCountFromServer to return default zeros (success for stats part)
    getCountFromServer.mockReturnValue({ data: () => ({ count: 0 }) });

    // Mock getDocs for agent_runs to throw an error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValueOnce(new Error('Failed to fetch recent runs'));

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Stats should still be default zeros as that part of the fetch might succeed
    expect(result.current.stats).toEqual({
      analyzed: 0, duplicatesCaught: 0, authoritiesNotified: 0,
      predictionsGenerated: 0, resolutionsVerified: 0, esgScored: 0,
    });
    // Recent runs should be an empty array because the error is caught and handled
    expect(result.current.recentRuns).toEqual([]);
    // Console error should have been called for the runs fetch
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useAgents/runs]:', expect.any(Error));

    consoleErrorSpy.mockRestore(); // Clean up the spy
  });

  it('should handle errors during stats fetch gracefully', async () => {
    // Mock getCountFromServer to throw an error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCountFromServer.mockRejectedValue(new Error('Failed to fetch counts'));

    // Mock getDocs for agent_runs to return default empty (success for runs part)
    getDocs.mockReturnValue({
      docs: [],
      empty: true,
      forEach: vi.fn(),
      size: 0,
    });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Stats should remain at initial zeros due to the error
    expect(result.current.stats).toEqual({
      analyzed: 0, duplicatesCaught: 0, authoritiesNotified: 0,
      predictionsGenerated: 0, resolutionsVerified: 0, esgScored: 0,
    });
    // Recent runs should still be an empty array (or whatever getDocs returns)
    expect(result.current.recentRuns).toEqual([]);
    // Console error should have been called for the main fetch block
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useAgents]:', expect.any(Error));

    consoleErrorSpy.mockRestore(); // Clean up the spy
  });
});