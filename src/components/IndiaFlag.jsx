// The national flag of India as an inline SVG — tricolor bands (saffron / white /
// green) WITH the Ashoka Chakra (navy, 24 spokes) centered in the white band, so
// the flag is rendered correctly wherever it appears. Pure CSS-free SVG; size via
// the `width` prop (height is the 3:2 flag ratio).
const NAVY = '#000080';

export default function IndiaFlag({ width = 22, style = {} }) {
  const h = (width * 2) / 3;          // 3:2 flag aspect ratio
  const band = h / 3;
  const cx = width / 2;
  const cy = h / 2;
  const r = band * 0.4;               // chakra radius (~3/4 of the white band)
  const hub = r * 0.16;

  // 24 evenly-spaced spokes from the hub to the rim.
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180;
    return (
      <line
        key={i}
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos(a)}
        y2={cy + r * Math.sin(a)}
        stroke={NAVY}
        strokeWidth={Math.max(0.2, r * 0.07)}
      />
    );
  });

  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label="Flag of India"
      style={{ borderRadius: '2px', border: '0.5px solid #1a2f4a', flexShrink: 0, display: 'block', ...style }}
    >
      <rect x="0" y="0" width={width} height={band} fill="#FF9933" />
      <rect x="0" y={band} width={width} height={band} fill="#FFFFFF" />
      <rect x="0" y={band * 2} width={width} height={band} fill="#138808" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={NAVY} strokeWidth={Math.max(0.25, r * 0.08)} />
      {spokes}
      <circle cx={cx} cy={cy} r={hub} fill={NAVY} />
    </svg>
  );
}
