export default function LoadingSkeleton({ count = 3, type = 'issue' }) {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  if (type === 'stats') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {skeletons.slice(0, 3).map(i => (
          <div key={i} style={{
            flex: 1, height: '72px', backgroundColor: '#0d1b2e',
            borderRadius: '10px', border: '0.5px solid #1a2f4a',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {skeletons.map(i => (
        <div key={i} style={{
          backgroundColor: '#0d1b2e', borderRadius: '14px',
          border: '0.5px solid #1a2f4a', padding: '16px',
          marginBottom: '10px',
          animation: 'shimmer 1.5s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ width: '120px', height: '14px', backgroundColor: '#1a2f4a', borderRadius: '4px' }} />
            <div style={{ width: '60px', height: '20px', backgroundColor: '#1a2f4a', borderRadius: '999px' }} />
          </div>
          <div style={{ width: '100%', height: '10px', backgroundColor: '#1a2f4a', borderRadius: '4px', marginBottom: '8px' }} />
          <div style={{ width: '75%', height: '10px', backgroundColor: '#1a2f4a', borderRadius: '4px', marginBottom: '12px' }} />
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '80px', height: '10px', backgroundColor: '#1a2f4a', borderRadius: '4px' }} />
            <div style={{ width: '60px', height: '10px', backgroundColor: '#1a2f4a', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
