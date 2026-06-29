import { Paperclip, AlertTriangle } from 'lucide-react';

const TYPE_LABEL = { photo: 'Photo', receipt: 'Receipt', document: 'Document', rti_response: 'RTI Response' };

// Grid of contributor-uploaded evidence (inline base64). Read-only; flags AI-judged
// not-relevant items. Renders nothing when there's no evidence.
export default function EvidenceGallery({ items = [] }) {
  if (!items.length) return null;

  return (
    <div style={{ backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a', padding: '16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Paperclip size={16} color="#00d4ff" strokeWidth={1.5} />
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff' }}>Evidence ({items.length})</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {items.map((ev) => (
          <div key={ev.id} style={{ borderRadius: '10px', overflow: 'hidden', border: '0.5px solid #1a2f4a', backgroundColor: '#112035' }}>
            {ev.imageBase64 && (
              <img src={ev.imageBase64} alt={ev.caption || 'evidence'}
                style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }} />
            )}
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#7ee8fa', textTransform: 'uppercase',
                  letterSpacing: '0.5px' }}>{TYPE_LABEL[ev.type] || ev.type}</span>
                {ev.relevant === false && (
                  <span title={ev.relevanceReason || 'AI flagged as not relevant'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px',
                      fontWeight: '600', color: '#eab308' }}>
                    <AlertTriangle size={9} strokeWidth={2} /> unverified
                  </span>
                )}
              </div>
              {ev.caption && <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>{ev.caption}</div>}
              <div style={{ fontSize: '10px', color: '#4a6280', marginTop: '3px' }}>by {ev.displayName || 'Citizen'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
