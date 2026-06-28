import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePagination } from '../../../src/hooks/usePagination'

describe('usePagination', () => {
  const generateItems = (count) => Array.from({ length: count }, (_, i) => `Item ${i + 1}`);

  // Test Case 1: Initial state with default pageSize and sufficient items
  it('should return the initial slice of items, hasMore true, and correct remaining count', () => {
    const items = generateItems(20); // 20 items
    const defaultPageSize = 8;

    const { result } = renderHook(() => usePagination(items));

    expect(result.current.visible.length).toBe(defaultPageSize);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(items.length - defaultPageSize);
  });

  // Test Case 2: Calling showMore once
  it('should expand the visible items and update hasMore/remaining after calling showMore', () => {
    const items = generateItems(20); // 20 items
    const defaultPageSize = 8;

    const { result } = renderHook(() => usePagination(items));

    // Initial state check (redundant but good for clarity)
    expect(result.current.visible.length).toBe(defaultPageSize);
    expect(result.current.hasMore).toBe(true);

    // Call showMore
    act(() => {
      result.current.showMore();
    });

    // After first showMore
    expect(result.current.visible.length).toBe(defaultPageSize * 2); // 8 + 8 = 16
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(items.length - (defaultPageSize * 2)); // 20 - 16 = 4
  });

  // Test Case 3: Calling showMore until all items are visible
  it('should show all items and set hasMore to false when all items are visible', () => {
    const items = generateItems(20); // 20 items
    const defaultPageSize = 8;

    const { result } = renderHook(() => usePagination(items));

    // Call showMore multiple times until all items are shown
    act(() => {
      result.current.showMore(); // 8 -> 16
      result.current.showMore(); // 16 -> 24 (but only 20 items exist)
    });

    expect(result.current.visible.length).toBe(items.length); // All 20 items
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  // Test Case 4: Items array smaller than pageSize
  it('should show all items and set hasMore to false if items count is less than pageSize', () => {
    const items = generateItems(5); // 5 items
    const defaultPageSize = 8;

    const { result } = renderHook(() => usePagination(items));

    expect(result.current.visible.length).toBe(items.length); // All 5 items
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  // Test Case 5: Empty items array
  it('should return an empty visible array, hasMore false, and remaining 0 for an empty items array', () => {
    const items = [];
    const defaultPageSize = 8;

    const { result } = renderHook(() => usePagination(items));

    expect(result.current.visible.length).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  // Test Case 6: Custom pageSize
  it('should use the provided custom pageSize', () => {
    const items = generateItems(20);
    const customPageSize = 5;

    const { result } = renderHook(() => usePagination(items, customPageSize));

    expect(result.current.visible.length).toBe(customPageSize);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(items.length - customPageSize);

    act(() => {
      result.current.showMore();
    });

    expect(result.current.visible.length).toBe(customPageSize * 2); // 5 + 5 = 10
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(items.length - (customPageSize * 2)); // 20 - 10 = 10
  });
});