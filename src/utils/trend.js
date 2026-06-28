// Time-series of issues reported vs resolved, for the Analytics trend chart.
//
// Buckets are spread evenly across the data's actual date range (earliest activity →
// latest), so the chart is always populated even when the data is historical (e.g.
// imported issues spanning past months) rather than only the last calendar weeks.

const toDate = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();          // Firestore Timestamp
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmt = (ms) => {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
};

// → [{ week: 'DD Mon', reported, resolved }] across `buckets` equal periods.
export function trendSeries(issues = [], buckets = 8) {
  const times = [];
  for (const it of issues) {
    const c = toDate(it.createdAt); if (c) times.push(c.getTime());
    const r = toDate(it.resolvedAt); if (r) times.push(r.getTime());
  }
  if (!times.length) return [];

  const min = Math.min(...times);
  const max = Math.max(...times);
  const size = Math.max((max - min) / buckets, 1);
  const arr = Array.from({ length: buckets }, (_, i) => ({ start: min + i * size, reported: 0, resolved: 0 }));

  const idxFor = (ms) => {
    if (ms == null) return -1;
    let i = Math.floor((ms - min) / size);
    if (i >= buckets) i = buckets - 1; // fold the max edge into the last bucket
    return i >= 0 ? i : -1;
  };

  for (const it of issues) {
    const c = toDate(it.createdAt);
    const ci = idxFor(c ? c.getTime() : null);
    if (ci >= 0) arr[ci].reported++;
    if (it.status === 'Resolved') {
      const r = toDate(it.resolvedAt) || c;
      const ri = idxFor(r ? r.getTime() : null);
      if (ri >= 0) arr[ri].resolved++;
    }
  }

  return arr.map((b) => ({ week: fmt(b.start), reported: b.reported, resolved: b.resolved }));
}
