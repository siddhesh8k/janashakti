export default function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#04091a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '40px', height: '40px',
        border: '3px solid #1a2f4a',
        borderTop: '3px solid #00d4ff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#00d4ff', fontSize: '14px', marginTop: '16px',
                  fontWeight: '600' }}>JanaShakti</p>
    </div>
  );
}
