import { useState } from 'react';

// Client-side "Show more" pagination for already-fetched lists. Reveals `pageSize`
// items at a time — the LinkedIn-style progressive-load pattern that fits our cards.
export function usePagination(items, pageSize = 8) {
  const [count, setCount] = useState(pageSize);
  const total = items.length;
  const visible = items.slice(0, count);
  const hasMore = total > count;
  const remaining = Math.max(0, total - count);
  const showMore = () => setCount(c => c + pageSize);
  return { visible, hasMore, remaining, showMore };
}
