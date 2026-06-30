import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useIssues } from '../hooks/useIssues';
import { useSharedLocation } from '../components/LocationProvider';
import { loadGoogleMaps } from '../utils/googleMaps';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { loadOrganizations } from '../utils/organizations';
import { distanceKm } from '../utils/geo';
import NationTagline from '../components/NationTagline';

const SEVERITY_COLORS = {
  Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e',
};

const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const FILTERS = ['All', 'Critical', 'Pothole', 'Garbage', 'Streetlight', 'Water Leakage', 'Traffic Signal'];

// Uniform adopted-zone radius drawn on the map (km).
const ZONE_RADIUS_KM = 2;
// Declutter: don't draw a zone if another drawn zone is closer than this (km).
const ZONE_MIN_SEPARATION_KM = 1.5;
// Indian-flag tricolor zone border (saffron / white / green) drawn as 3 concentric
// solid rings, with the Ashoka Chakra at the centre (see chakraSvgDataUrl).
const TRICOLOR = ['#FF9933', '#FFFFFF', '#138808'];
const TRICOLOR_GAP_KM = 0.06; // radius step between the three rings
// Cap drawn zones (tricolor = more overlays per zone, so keep this modest).
const ZONE_MAX_VISIBLE = 50;

// Inline Lucide SVG (GraduationCap / Building2) for the Maps InfoWindow HTML —
// avoids emoji-as-icons (CLAUDE.md) while keeping a crisp colored glyph.
const orgIconSvg = (org) => {
  const attrs = `width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${org.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"`;
  if (org.type === 'college') {
    return `<svg ${attrs}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`;
  }
  return `<svg ${attrs}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
};

// Ashoka Chakra (navy, 24 spokes) on a faint white disc, as an SVG data URL —
// placed at each adopted zone's centre so the tricolor zone reads as the national
// flag, chakra included.
const chakraSvgDataUrl = () => {
  const size = 26, c = size / 2, r = 8;
  let spokes = '';
  for (let i = 0; i < 24; i++) {
    const a = (i * 15 * Math.PI) / 180;
    spokes += `<line x1="${c}" y1="${c}" x2="${(c + r * Math.cos(a)).toFixed(2)}" y2="${(c + r * Math.sin(a)).toFixed(2)}" stroke="#000080" stroke-width="0.7"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="11" fill="#ffffff" fill-opacity="0.92" stroke="#000080" stroke-width="0.8"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#000080" stroke-width="0.8"/>` +
    spokes +
    `<circle cx="${c}" cy="${c}" r="1.3" fill="#000080"/>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};
// Computed once — the chakra icon is identical for every zone, so don't rebuild it
// per marker on every map idle.
const CHAKRA_URL = chakraSvgDataUrl();

// Pulsing marker for Critical issues — a solid dot plus an outer ring that animates
// its radius + opacity (SMIL), as an SVG data URL. Subtle ~1.6s loop. Browsers that
// ignore SMIL still show the solid dot, so it degrades gracefully.
const criticalMarkerSvg = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">` +
    `<circle cx="22" cy="22" r="6" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>` +
    `<circle cx="22" cy="22" r="6" fill="none" stroke="${color}" stroke-width="2" opacity="0.7">` +
      `<animate attributeName="r" from="6" to="20" dur="1.6s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite"/>` +
    `</circle></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};

// Closed ring of lat/lng points approximating a circle, for a dotted zone border.
const ringPoints = (lat, lng, radiusKm, n = 64) => {
  const pts = [];
  const latR = (lat * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.cos(a);
    const dLng = (radiusKm / (111 * Math.cos(latR))) * Math.sin(a);
    pts.push({ lat: lat + dLat, lng: lng + dLng });
  }
  return pts;
};

export default function MapScreen() {
  const navigate = useNavigate();
  const { issues } = useIssues({ limitCount: 50 });
  const { location } = useSharedLocation();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const locationRef = useRef(location);
  const userCenteredRef = useRef(false);
  const orgsRef = useRef([]);
  const zoneOverlaysRef = useRef([]);
  const zoneInfoRef = useRef(null);
  const clusterInfoRef = useRef(null);
  const [filter, setFilter] = useState('All');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [mapsReady, setMapsReady] = useState(false); // Google Maps script loaded
  const [geoReady, setGeoReady] = useState(false);   // location resolved (or timed out)

  // Keep location ref up to date without triggering script reload
  useEffect(() => { locationRef.current = location; }, [location]);

  // Draw adopted-zone overlays ONLY for orgs inside the current viewport (capped),
  // re-running on every map idle. Keeps the map fast no matter how many orgs exist.
  const drawZonesInView = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;
    const maps = window.google.maps;
    const bounds = map.getBounds();
    if (!bounds) return;

    zoneOverlaysRef.current.forEach(o => o.setMap(null));
    zoneOverlaysRef.current = [];
    if (!zoneInfoRef.current) zoneInfoRef.current = new maps.InfoWindow();
    const info = zoneInfoRef.current;

    // Zones in view → drop ones that overlap an already-kept zone (declutter) →
    // cap the total for performance when zoomed far out.
    const inView = orgsRef.current.filter(
      o => o.zone && bounds.contains(new maps.LatLng(o.zone.lat, o.zone.lng))
    );
    const visible = [];
    for (const o of inView) {
      const overlaps = visible.some(
        k => distanceKm(k.zone.lat, k.zone.lng, o.zone.lat, o.zone.lng) < ZONE_MIN_SEPARATION_KM
      );
      if (overlaps) continue;
      visible.push(o);
      if (visible.length >= ZONE_MAX_VISIBLE) break;
    }

    visible.forEach(org => {
      try {
        // Faint zone fill (clickable area) in a soft national green.
        const circle = new maps.Circle({
          center: { lat: org.zone.lat, lng: org.zone.lng },
          radius: ZONE_RADIUS_KM * 1000,
          fillColor: '#138808', fillOpacity: 0.05,
          strokeOpacity: 0, strokeWeight: 0,
          map, clickable: true,
        });
        zoneOverlaysRef.current.push(circle);

        // Tricolor border — three concentric solid rings (saffron / white / green).
        TRICOLOR.forEach((color, i) => {
          const ring = new maps.Polyline({
            path: ringPoints(org.zone.lat, org.zone.lng, ZONE_RADIUS_KM - i * TRICOLOR_GAP_KM, 48),
            map, clickable: false,
            strokeColor: color, strokeOpacity: 0.9, strokeWeight: 3,
          });
          zoneOverlaysRef.current.push(ring);
        });

        // Ashoka Chakra at the zone centre — completes the national-flag motif.
        // Faded (low opacity) so it's a subtle accent, not a loud marker.
        const chakra = new maps.Marker({
          position: { lat: org.zone.lat, lng: org.zone.lng },
          map, clickable: false, zIndex: 50, opacity: 0.4,
          icon: {
            url: CHAKRA_URL,
            scaledSize: new maps.Size(22, 22),
            anchor: new maps.Point(11, 11),
          },
        });
        zoneOverlaysRef.current.push(chakra);

        circle.addListener('click', () => {
          info.setContent(
            `<div style="background:#0d1b2e;color:#f0f6ff;padding:10px;border-radius:8px;max-width:210px;font-family:sans-serif;">` +
              `<div style="font-weight:600;font-size:13px;margin-bottom:4px;color:${org.color}">${orgIconSvg(org)}${org.name}</div>` +
              `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Adopted zone: ${org.zoneName}</div>` +
              `<div style="font-size:11px;color:#86efac;margin-bottom:6px;">${org.memberCount} ${org.type === 'college' ? 'students' : 'employees'} contributing</div>` +
              `<div style="font-size:10px;font-weight:600;color:#FF9933;">A step towards a better nation, our better India</div>` +
            `</div>`
          );
          info.setPosition({ lat: org.zone.lat, lng: org.zone.lng });
          info.open(map);
        });
      } catch (err) {
        console.error('[MapZone]:', err);
      }
    });
  }, []);

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const center = locationRef.current || { lat: 12.9716, lng: 77.5946 };
    try {
      const map = new window.google.maps.Map(mapRef.current, {
        center, zoom: 12,
        styles: DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapInstanceRef.current = map;
      setMapLoaded(true);

      // Load orgs once, then draw only the zones in view on each map idle.
      if (window.google?.maps) {
        loadOrganizations().then((orgs) => {
          orgsRef.current = orgs;
          drawZonesInView();
          // Debounce so rapid pan/zoom doesn't thrash (rebuild ~250 overlays) on
          // every intermediate idle event.
          let idleTimer;
          map.addListener('idle', () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(drawZonesInView, 200);
          });
        }).catch((err) => console.error('[MapZone load]:', err));
      }
    } catch (err) {
      console.error('[MapScreen]:', err);
      setMapError(err.message);
    }
  }, [drawZonesInView]);

  // Load the Google Maps script once.
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((err) => setMapError(err.message));
  }, []);

  // Mark location ready as soon as we have a fix, or after a short fallback so the
  // map never gets stuck if GPS is slow/blocked.
  useEffect(() => {
    if (location) { setGeoReady(true); return; }
    const t = setTimeout(() => setGeoReady(true), 6000);
    return () => clearTimeout(t);
  }, [location]);

  // Initialize the map ONLY once both the script and a location are ready, so it
  // opens directly at the user's location — no default→current jump.
  useEffect(() => {
    if (mapsReady && geoReady && !mapInstanceRef.current) initMap();
  }, [mapsReady, geoReady, initMap]);

  // Drop the "you are here" marker once location resolves (and keep it in sync).
  // The map already opened at this location, so this no longer causes a jump.
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !location) return;
    const maps = window.google.maps;
    if (!userCenteredRef.current) {
      mapInstanceRef.current.setCenter(location);
      userCenteredRef.current = true;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(location);
    } else {
      // Standard Google Maps location pin (not a colored circle) for "you are here".
      userMarkerRef.current = new maps.Marker({
        position: location,
        map: mapInstanceRef.current,
        title: 'You are here',
        zIndex: 9999,
      });
    }
  }, [location, mapLoaded]);

  // Update markers when issues or filter change
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;
    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    clusterInfoRef.current?.close();

    const filtered = filter === 'All' ? issues
      : filter === 'Critical' ? issues.filter(i => i.severity === 'Critical')
      : issues.filter(i => i.issueType === filter);

    const maps = window.google.maps;
    const map = mapInstanceRef.current;

    // Group issues into ~200m grid cells (0.002° ≈ 220m).
    const CELL = 0.002;
    const cells = {};
    filtered.forEach(issue => {
      if (!issue.location?.lat) return;
      const key = `${Math.round(issue.location.lat / CELL)}_${Math.round(issue.location.lng / CELL)}`;
      (cells[key] = cells[key] || []).push(issue);
    });

    const highestSeverity = (group) =>
      group.reduce((best, i) =>
        (SEVERITY_RANK[i.severity] || 0) > (SEVERITY_RANK[best] || 0) ? i.severity : best, 'Low');

    const renderSingle = (issue) => {
      const color = SEVERITY_COLORS[issue.severity] || '#475569';
      // Critical issues get a pulsing animated marker; others a plain circle.
      const icon = issue.severity === 'Critical'
        ? { url: criticalMarkerSvg(color), scaledSize: new maps.Size(44, 44), anchor: new maps.Point(22, 22) }
        : {
            path: maps.SymbolPath.CIRCLE, scale: 7,
            fillColor: color, fillOpacity: 0.9,
            strokeColor: '#ffffff', strokeWeight: 1.5,
          };
      const marker = new maps.Marker({
        position: { lat: issue.location.lat, lng: issue.location.lng },
        map, icon, title: issue.issueType,
        zIndex: issue.severity === 'Critical' ? 100 : 10,
      });
      const infoWindow = new maps.InfoWindow({
        content: `
          <div style="background:#0d1b2e;color:#f0f6ff;padding:10px;border-radius:8px;max-width:220px;font-family:sans-serif;">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${issue.issueType}</div>
            <div style="font-size:11px;color:${color};font-weight:600;margin-bottom:6px;">${issue.severity}</div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;line-height:1.4;">${(issue.description || '').substring(0, 80)}...</div>
            <div style="font-size:10px;color:#7689a3;">${issue.confirmations || 0} confirmed</div>
          </div>`,
      });
      marker.addListener('click', () => {
        infoWindow.open(map, marker);
        setTimeout(() => navigate(`/issue/${issue.id}`), 2000);
      });
      markersRef.current.push(marker);
    };

    // A cluster click opens a scrollable list of the grouped issues; each row links
    // to its detail page. (Clustering is a fixed geographic grid, so zooming alone
    // would never break a cluster apart — especially reports at the same spot.)
    const openClusterList = (group, lat, lng) => {
      if (!clusterInfoRef.current) clusterInfoRef.current = new maps.InfoWindow();
      const info = clusterInfoRef.current;
      const rows = group.map(i => {
        const c = SEVERITY_COLORS[i.severity] || '#475569';
        const full = i.description || '';
        const desc = full.substring(0, 48);
        return `<div id="cl-${i.id}" role="button" style="cursor:pointer;background:#112035;border:0.5px solid #1a2f4a;border-left:3px solid ${c};border-radius:6px;padding:7px 9px;margin-bottom:5px;">`
          + `<div style="font-weight:600;font-size:12px;color:#f0f6ff;">${i.issueType}`
          + `<span style="font-size:10px;color:${c};font-weight:600;margin-left:6px;">${i.severity}</span></div>`
          + (desc ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.35;">${desc}${full.length > 48 ? '…' : ''}</div>` : '')
          + `<div style="font-size:9px;color:#7689a3;margin-top:3px;">${i.confirmations || 0} confirmed · tap to open</div>`
          + `</div>`;
      }).join('');
      info.setContent(
        `<div style="background:#0d1b2e;padding:10px;border-radius:8px;width:230px;max-height:260px;overflow-y:auto;font-family:sans-serif;">`
        + `<div style="font-weight:600;font-size:13px;color:#00d4ff;margin-bottom:8px;">${group.length} issues here</div>`
        + rows + `</div>`
      );
      info.setPosition({ lat, lng });
      info.open(map);
      map.panTo({ lat, lng });
      maps.event.addListenerOnce(info, 'domready', () => {
        group.forEach(i => {
          const el = document.getElementById(`cl-${i.id}`);
          if (el) el.addEventListener('click', () => navigate(`/issue/${i.id}`));
        });
      });
    };

    Object.values(cells).forEach(group => {
      // Clusters of 3+ collapse into one numbered circle; click lists the issues.
      if (group.length >= 3) {
        const lat = group.reduce((s, i) => s + i.location.lat, 0) / group.length;
        const lng = group.reduce((s, i) => s + i.location.lng, 0) / group.length;
        const color = SEVERITY_COLORS[highestSeverity(group)] || '#475569';
        const cluster = new maps.Marker({
          position: { lat, lng }, map,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: Math.min(22, 12 + group.length),
            fillColor: color, fillOpacity: 0.85,
            strokeColor: '#ffffff', strokeWeight: 2,
          },
          label: { text: String(group.length), color: '#04091a', fontSize: '12px', fontWeight: '700' },
          title: `${group.length} issues here — tap to view`,
        });
        cluster.addListener('click', () => openClusterList(group, lat, lng));
        markersRef.current.push(cluster);
      } else {
        group.forEach(renderSingle);
      }
    });
  }, [issues, filter, mapLoaded, navigate]);

  const filteredCount = filter === 'All' ? issues.length
    : filter === 'Critical' ? issues.filter(i => i.severity === 'Critical').length
    : issues.filter(i => i.issueType === filter).length;

  return (
    <div style={{ height: 'calc(100vh - 64px)', position: 'relative', backgroundColor: '#080f1e' }}>
      {/* National tagline banner */}
      <div style={{
        position: 'absolute', top: '10px', left: '12px', right: '12px',
        zIndex: 11, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <NationTagline />
      </div>

      {/* Filter row */}
      <div style={{
        position: 'absolute', top: '48px', left: '12px', right: '12px',
        zIndex: 10, display: 'flex', gap: '6px', overflowX: 'auto',
      }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: '999px', fontSize: '11px',
            fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            backgroundColor: filter === f ? '#00d4ff' : '#04091acc',
            color: filter === f ? '#04091a' : '#f0f6ff',
            border: filter === f ? 'none' : '0.5px solid #1a2f4a',
            backdropFilter: 'blur(8px)',
          }}>{f}</button>
        ))}
      </div>

      {/* Floating stats */}
      <div style={{
        position: 'absolute', top: '88px', left: '12px', zIndex: 10,
        backgroundColor: '#04091acc', backdropFilter: 'blur(8px)',
        borderRadius: '8px', padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <Activity size={14} color="#00d4ff" strokeWidth={1.5} />
        <span style={{ fontSize: '12px', color: '#f0f6ff', fontWeight: '500' }}>
          {filteredCount} issue{filteredCount !== 1 ? 's' : ''} in view
        </span>
      </div>

      {/* Map or error/fallback */}
      {mapError ? (
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <p style={{ color: '#ef4444', fontSize: '15px', fontWeight: '600', marginBottom: '8px', textAlign: 'center' }}>
            Map failed to load
          </p>
          <p style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', maxWidth: '320px', lineHeight: '1.5' }}>
            {mapError}
          </p>
          <p style={{ color: '#7689a3', fontSize: '11px', marginTop: '12px', textAlign: 'center' }}>
            Enable <strong style={{ color: '#94a3b8' }}>Maps JavaScript API</strong> in Google Cloud Console and ensure billing is active.
          </p>
        </div>
      ) : (
        <>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          {!mapLoaded && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5, backgroundColor: '#080f1e',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '12px',
            }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid #1a2f4a',
                            borderTop: '3px solid #00d4ff', borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Locating you…</span>
            </div>
          )}
        </>
      )}

      {/* Legend — top-right so it doesn't collide with the floating voice button or
          the Google attribution in the bottom corners. */}
      <div style={{
        position: 'absolute', top: '88px', right: '12px', zIndex: 10,
        backgroundColor: '#04091acc', backdropFilter: 'blur(8px)',
        borderRadius: '8px', padding: '8px 12px',
      }}>
        {Object.entries(SEVERITY_COLORS).map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px',
                                    marginBottom: '2px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }} />
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
