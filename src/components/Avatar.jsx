import { useState } from 'react';
import { User } from 'lucide-react';

// Robust user avatar. Renders the photo when available; on a load failure (Google
// profile URLs frequently 403) or when no photo exists, falls back to initials,
// or a User icon when there's no name — so it never shows a broken-image glyph.
// `referrerPolicy="no-referrer"` also fixes most Google avatar 403s.
export default function Avatar({
  src, name, size = 28, ring = '1.5px solid #1a2f4a',
  textColor = '#94a3b8', bg = '#112035', style = {},
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: ring, objectFit: 'cover', display: 'block', ...style,
  };

  if (src && !failed) {
    return (
      <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async"
        onError={() => setFailed(true)} style={base} />
    );
  }

  return (
    <div style={{
      ...base, backgroundColor: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: textColor, fontWeight: '600', fontSize: Math.max(10, Math.round(size * 0.4)),
    }}>
      {initials || <User size={Math.round(size * 0.55)} color={textColor} strokeWidth={1.5} />}
    </div>
  );
}
