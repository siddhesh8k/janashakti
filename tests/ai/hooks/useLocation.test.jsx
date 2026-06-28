import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeoLocation } from '../../../src/hooks/useLocation';
import * as geocodeUtils from '../../../src/utils/geocode';

describe('useGeoLocation', () => {
  // Mock navigator.geolocation
  const mockGeolocation = {
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  };

  // Mock reverseGeocode utility function
  const mockReverseGeocode = vi.fn();

  // Store original navigator.geolocation to restore after all tests
  const originalGeolocation = global.navigator.geolocation;

  beforeAll(() => {
    // Replace the global navigator.geolocation with our mock for all tests in this block
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
    });
    // Mock the reverseGeocode utility
    vi.spyOn(geocodeUtils, 'reverseGeocode').mockImplementation(mockReverseGeocode);
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockGeolocation.watchPosition.mockReset();
    mockGeolocation.clearWatch.mockReset();
    mockReverseGeocode.mockReset();

    // Default watchPosition returns a numeric watch id.
    mockGeolocation.watchPosition.mockReturnValue(1);

    // Ensure navigator.geolocation is set to our mock for most tests
    // (It might be temporarily set to undefined in the "not supported" test)
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers(); // Always switch back to real timers between tests
  });

  afterAll(() => {
    // Restore original navigator.geolocation after all tests in this block
    Object.defineProperty(global.navigator, 'geolocation', {
      value: originalGeolocation,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  // Test Case 1: Geolocation not supported
  it('should handle geolocation not supported', () => {
    // Temporarily set navigator.geolocation to undefined for this specific test
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      writable: true,
    });

    const { result } = renderHook(() => useGeoLocation());

    expect(result.current.location).toEqual({ lat: 20.5937, lng: 78.9629 }); // Hardcoded default location
    expect(result.current.locationText).toBe('Location unavailable');
    expect(result.current.accuracy).toBeNull();
    expect(result.current.error).toBe('Geolocation not supported');
    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();
  });

  // Test Case 2: Initial state and watchPosition call
  it('should return initial state and call watchPosition', () => {
    const { result } = renderHook(() => useGeoLocation());

    expect(result.current.location).toBeNull();
    expect(result.current.locationText).toBe('Detecting...');
    expect(result.current.accuracy).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockGeolocation.watchPosition).toHaveBeenCalledWith(
      expect.any(Function), // onFix callback
      expect.any(Function), // onErr callback
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  // Test Case 3: Successful geolocation fix, accuracy filtering, and movement threshold.
  // Uses REAL timers so the async reverseGeocode microtasks resolve naturally.
  it('should update location, accuracy, and text on successful fix, respecting accuracy and movement thresholds', async () => {
    let onFixCallback;
    mockGeolocation.watchPosition.mockImplementation((onFix) => {
      onFixCallback = onFix;
      return 123;
    });
    mockReverseGeocode.mockResolvedValue('Mock Address 1');

    const { result } = renderHook(() => useGeoLocation());

    // First fix (accuracy 100) — accepted.
    await act(async () => {
      onFixCallback({ coords: { latitude: 10.0, longitude: 20.0, accuracy: 100 } });
    });

    await waitFor(() => {
      expect(result.current.location).toEqual({ lat: 10, lng: 20 });
      expect(result.current.accuracy).toBe(100);
      expect(result.current.locationText).toBe('Mock Address 1');
    });
    expect(mockReverseGeocode).toHaveBeenCalledWith(10, 20);
    expect(mockReverseGeocode).toHaveBeenCalledTimes(1);

    // Second fix (accuracy 50) — more accurate, tiny movement (< 0.0003) so NO new geocode.
    await act(async () => {
      onFixCallback({ coords: { latitude: 10.00001, longitude: 20.00001, accuracy: 50 } });
    });

    await waitFor(() => {
      expect(result.current.location).toEqual({ lat: 10.00001, lng: 20.00001 });
      expect(result.current.accuracy).toBe(50);
    });
    expect(result.current.locationText).toBe('Mock Address 1'); // unchanged
    expect(mockReverseGeocode).toHaveBeenCalledTimes(1); // still once

    // Third fix (accuracy 70) — worse than best (50) + 1, so ignored entirely.
    await act(async () => {
      onFixCallback({ coords: { latitude: 10.00002, longitude: 20.00002, accuracy: 70 } });
    });

    expect(result.current.location).toEqual({ lat: 10.00001, lng: 20.00001 });
    expect(result.current.accuracy).toBe(50);
    expect(result.current.locationText).toBe('Mock Address 1');
    expect(mockReverseGeocode).toHaveBeenCalledTimes(1);

    // Fourth fix (accuracy 30) — more accurate + significant movement (> 0.0003) so geocode again.
    mockReverseGeocode.mockResolvedValue('Mock Address 2');
    await act(async () => {
      onFixCallback({ coords: { latitude: 10.0005, longitude: 20.0005, accuracy: 30 } });
    });

    await waitFor(() => {
      expect(result.current.location).toEqual({ lat: 10.0005, lng: 20.0005 });
      expect(result.current.accuracy).toBe(30);
      expect(result.current.locationText).toBe('Mock Address 2');
    });
    expect(mockReverseGeocode).toHaveBeenCalledWith(10.0005, 20.0005);
    expect(mockReverseGeocode).toHaveBeenCalledTimes(2);
  });

  // Test Case 4: Geolocation error before any successful fix
  it('should handle geolocation error when no fix has been obtained yet', async () => {
    let onErrCallback;
    mockGeolocation.watchPosition.mockImplementation((onFix, onErr) => {
      onErrCallback = onErr;
      return 456;
    });

    const { result } = renderHook(() => useGeoLocation());

    await act(async () => {
      onErrCallback(new Error('User denied geolocation'));
    });

    expect(result.current.error).toBe('User denied geolocation');
    expect(result.current.locationText).toBe('Location not available');
    expect(result.current.location).toEqual({ lat: 12.9716, lng: 77.5946 }); // Hardcoded default error location
    expect(result.current.accuracy).toBeNull();
  });

  // Test Case 5: Geolocation error after a successful fix
  it('should update error state but retain last good location if error occurs after a fix', async () => {
    let onFixCallback;
    let onErrCallback;
    mockGeolocation.watchPosition.mockImplementation((onFix, onErr) => {
      onFixCallback = onFix;
      onErrCallback = onErr;
      return 457;
    });
    mockReverseGeocode.mockResolvedValue('First Good Address');

    const { result } = renderHook(() => useGeoLocation());

    // Successful fix first.
    await act(async () => {
      onFixCallback({ coords: { latitude: 30, longitude: 40, accuracy: 200 } });
    });

    await waitFor(() => {
      expect(result.current.location).toEqual({ lat: 30, lng: 40 });
      expect(result.current.accuracy).toBe(200);
      expect(result.current.locationText).toBe('First Good Address');
    });
    expect(result.current.error).toBeNull();

    // Now an error — should keep the last good location/text/accuracy.
    await act(async () => {
      onErrCallback(new Error('Geolocation timeout'));
    });

    expect(result.current.error).toBe('Geolocation timeout');
    expect(result.current.location).toEqual({ lat: 30, lng: 40 });
    expect(result.current.locationText).toBe('First Good Address');
    expect(result.current.accuracy).toBe(200);
  });

  // Test Case 6: Cleanup on unmount
  it('should clear watch and timeout on unmount', () => {
    vi.useFakeTimers();
    const mockWatchId = 789;
    mockGeolocation.watchPosition.mockReturnValue(mockWatchId);

    const { unmount } = renderHook(() => useGeoLocation());

    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockGeolocation.clearWatch).not.toHaveBeenCalled();

    unmount();

    expect(mockGeolocation.clearWatch).toHaveBeenCalledTimes(1);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(mockWatchId);

    // Advancing timers must not trigger the (cleared) 20s timeout again.
    vi.advanceTimersByTime(20000);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledTimes(1);
  });

  // Test Case 7: Timeout for watchPosition after 20 seconds
  it('should clear watch after 20 seconds to conserve battery', () => {
    vi.useFakeTimers();
    const mockWatchId = 111;
    mockGeolocation.watchPosition.mockReturnValue(mockWatchId);

    renderHook(() => useGeoLocation());

    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockGeolocation.clearWatch).not.toHaveBeenCalled();

    // Just before the 20s mark.
    vi.advanceTimersByTime(19999);
    expect(mockGeolocation.clearWatch).not.toHaveBeenCalled();

    // Past the 20s mark.
    vi.advanceTimersByTime(1);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledTimes(1);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(mockWatchId);
  });
});
