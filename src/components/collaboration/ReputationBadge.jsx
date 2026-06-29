import { Star } from 'lucide-react';

// Inline Community Reputation chip shown next to a user's name.
// Tiers: gray < 100 · cyan < 500 · green < 1000 · gold ≥ 1000 (subtle glow).
export default function ReputationBadge({ score = 0, size = 11 }) {
  const s = Number(score) || 0;
  const color = s >= 1000 ? '#f59e0b' : s >= 500 ? '#16a34a' : s >= 100 ? '#00d4ff' : '#94a3b8';
  return (
    <span
      title="Community Reputation"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '3px',
        fontSize: `${size}px`, fontWeight: '700', color,
        ...(s >= 1000 ? { textShadow: '0 0 8px rgba(245,158,11,0.55)' } : {}),
      }}
    >
      <Star size={size + 1} strokeWidth={2} fill={s >= 1000 ? color : 'none'} />
      {s.toLocaleString()}
    </span>
  );
}
