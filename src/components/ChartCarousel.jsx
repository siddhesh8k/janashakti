import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const navBtn = {
  background: '#112035', border: '0.5px solid #1a2f4a', borderRadius: '8px',
  color: '#94a3b8', cursor: 'pointer', padding: '4px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// Single card that holds several charts as swipeable slides — saves vertical space vs
// stacking them. Only the ACTIVE slide is mounted, so Recharts' ResponsiveContainer
// measures a visible width (hidden containers would render at 0px).
export default function ChartCarousel({ slides = [] }) {
  const [i, setI] = useState(0);
  const startX = useRef(null);
  const n = slides.length;
  if (!n) return null;

  const idx = Math.min(i, n - 1);
  const go = (d) => setI((p) => (p + d + n) % n);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  return (
    <div style={{
      backgroundColor: '#0d1b2e', borderRadius: '14px',
      border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>{slides[idx].title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {n > 1 && (
            <button onClick={() => go(-1)} aria-label="Previous chart" style={navBtn}>
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
          )}
          <div style={{ display: 'flex', gap: '5px' }}>
            {slides.map((_, d) => (
              <span key={d} onClick={() => setI(d)} style={{
                width: d === idx ? '16px' : '6px', height: '6px', borderRadius: '3px',
                cursor: 'pointer', transition: 'all 0.2s',
                backgroundColor: d === idx ? '#00d4ff' : '#1a2f4a',
              }} />
            ))}
          </div>
          {n > 1 && (
            <button onClick={() => go(1)} aria-label="Next chart" style={navBtn}>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {slides[idx].content}
      </div>
    </div>
  );
}
