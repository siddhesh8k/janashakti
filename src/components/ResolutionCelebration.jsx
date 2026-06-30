import { memo, useEffect } from 'react';
import { Trophy, MapPin, PartyPopper, Star } from 'lucide-react';

const CONFETTI_COLORS = ['#00d4ff', '#16a34a', '#f97316', '#eab308', '#3b82f6', '#86efac'];

// Full-screen overlay shown when an issue flips to Resolved.
// Auto-dismisses after 5s; tap anywhere to close sooner.
function ResolutionCelebration({ issue, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose?.(), 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  // 40 confetti pieces, index-derived spread (no Math.random in render path).
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    left: (i * 2.5) % 100,
    delay: (i % 10) * 0.15,
    duration: 2.2 + (i % 5) * 0.4,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + (i % 4) * 3,
  }));

  const statBox = {
    flex: 1, backgroundColor: '#0d1b2e', border: '0.5px solid #1a2f4a',
    borderRadius: '12px', padding: '12px', textAlign: 'center',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      backgroundColor: 'rgba(4,9,26,0.95)', backdropFilter: 'blur(4px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', cursor: 'pointer', overflow: 'hidden',
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Confetti */}
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, left: `${p.left}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          backgroundColor: p.color, borderRadius: '2px',
          animation: `confettiFall ${p.duration}s linear ${p.delay}s infinite`,
        }} />
      ))}

      {/* Card */}
      <div style={{ textAlign: 'center', maxWidth: '340px', width: '100%',
                    animation: 'slideUp 0.5s ease', zIndex: 1 }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          backgroundColor: '#16a34a20', border: '3px solid #16a34a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
        }}>
          <Trophy size={40} color="#16a34a" strokeWidth={1.5} />
        </div>

        <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', marginBottom: '8px' }}>
          Issue Resolved!
        </h2>

        <p style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff', marginBottom: '4px' }}>
          {issue?.issueType || 'Civic issue'}
        </p>
        {issue?.locationText && (
          <p style={{ fontSize: '12px', color: '#94a3b8', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '14px' }}>
            <MapPin size={12} strokeWidth={1.5} />
            {issue.locationText.split(',').slice(0, 2).join(',')}
          </p>
        )}

        <p style={{ fontSize: '13px', color: '#86efac', marginBottom: '16px' }}>
          Community pressure worked. Authorities responded.
        </p>

        {/* Stat boxes */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          <div style={statBox}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#00d4ff' }}>
              {issue?.confirmations || 0}
            </div>
            <div style={{ fontSize: '10px', color: '#7689a3', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginTop: '2px' }}>Confirmations</div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#16a34a' }}>+25</div>
            <div style={{ fontSize: '10px', color: '#7689a3', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginTop: '2px' }}>Civic Points</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: '6px', marginBottom: '20px' }}>
          <PartyPopper size={16} color="#f97316" strokeWidth={1.5} />
          <span style={{ fontSize: '13px', color: '#f0f6ff', fontWeight: '600', fontStyle: 'italic' }}>
            Democracy in action
          </span>
          <Star size={16} color="#eab308" strokeWidth={1.5} />
        </div>

        <span style={{ fontSize: '11px', color: '#7689a3' }}>Tap anywhere to close</span>
      </div>
    </div>
  );
}

export default memo(ResolutionCelebration);
