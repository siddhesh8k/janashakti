import { useState } from 'react';
import { cloudinaryThumb } from '../utils/cloudinary';

// Draggable before/after image comparison. `before` (original issue photo) shows
// underneath; `after` (resolution photo) is revealed from the left by a range
// slider — works with mouse and touch. Pure presentational, theme-styled.
export default function BeforeAfterSlider({ before, after, height = 240 }) {
  const [pos, setPos] = useState(50); // % of the "after" image revealed

  if (!before || !after) return null;

  return (
    <div style={{
      position: 'relative', width: '100%', height: `${height}px`,
      borderRadius: '14px', overflow: 'hidden', userSelect: 'none',
      border: '0.5px solid #1a2f4a', backgroundColor: '#04091a',
    }}>
      {/* AFTER (resolution) — base layer */}
      <img src={cloudinaryThumb(after, 640)} alt="After" draggable={false} loading="lazy" decoding="async" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
      }} />
      {/* BEFORE (original) — clipped to the left of the handle */}
      <div style={{ position: 'absolute', inset: 0, width: `${pos}%`, overflow: 'hidden' }}>
        <img src={cloudinaryThumb(before, 640)} alt="Before" draggable={false} loading="lazy" decoding="async" style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${100 / (pos / 100)}%`, maxWidth: 'none', objectFit: 'cover',
        }} />
      </div>

      {/* Corner labels */}
      <span style={labelStyle('left')}>BEFORE</span>
      <span style={labelStyle('right')}>AFTER</span>

      {/* Divider line + handle */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
        width: '2px', backgroundColor: '#00d4ff', transform: 'translateX(-1px)',
        pointerEvents: 'none', boxShadow: '0 0 8px #00d4ff80',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '30px', height: '30px', borderRadius: '50%',
          backgroundColor: '#00d4ff', color: '#04091a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: '700', boxShadow: '0 0 10px #00d4ff80',
        }}>⇆</div>
      </div>

      {/* Full-area range input drives the position (transparent, on top) */}
      <input
        type="range" min="0" max="100" value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Before/after comparison"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          margin: 0, opacity: 0, cursor: 'ew-resize',
        }}
      />
    </div>
  );
}

const labelStyle = (side) => ({
  position: 'absolute', top: '8px', [side]: '8px',
  backgroundColor: '#04091acc', color: '#f0f6ff',
  fontSize: '10px', fontWeight: '600', letterSpacing: '0.7px',
  padding: '3px 8px', borderRadius: '999px', pointerEvents: 'none',
});
