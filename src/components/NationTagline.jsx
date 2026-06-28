import IndiaFlag from './IndiaFlag';

// Patriotic brand tagline with the national flag of India (tricolor + Ashoka
// Chakra) rendered as an inline SVG — see IndiaFlag.
export default function NationTagline({ style = {} }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      backgroundColor: '#04091acc', backdropFilter: 'blur(8px)',
      border: '0.5px solid #1a2f4a', borderRadius: '999px',
      padding: '6px 12px', ...style,
    }}>
      <IndiaFlag width={20} />
      <span style={{ fontSize: '11px', fontWeight: '600', color: '#f0f6ff', whiteSpace: 'nowrap' }}>
        A Step Towards a Better Nation,{' '}
        <span style={{ color: '#86efac' }}>Our Better India</span>
      </span>
    </div>
  );
}
