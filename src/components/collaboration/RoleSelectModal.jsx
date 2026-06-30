import { useState } from 'react';
import { X } from 'lucide-react';
import { COLLAB_ROLES } from '../../constants/issueTypes';

// Bottom-sheet: pick your civic role before joining an issue.
export default function RoleSelectModal({ open, onClose, onConfirm, busy }) {
  const [role, setRole] = useState(COLLAB_ROLES[0]);
  if (!open) return null;

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(4,9,26,0.8)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0d1b2e', borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
          border: '0.5px solid #1a2f4a', borderBottom: 'none', padding: '18px',
          width: '100%', maxWidth: '440px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#f0f6ff' }}>Join this issue</span>
          <button onClick={() => !busy && onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <X size={18} color="#7689a3" />
          </button>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px', lineHeight: 1.5 }}>
          You're joining as a contributor — pick how you're helping. You can upload evidence,
          post updates, and help verify the fix.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {COLLAB_ROLES.map((r) => {
            const active = r === role;
            return (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  padding: '9px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: active ? '#00d4ff' : 'transparent',
                  color: active ? '#04091a' : '#94a3b8',
                  border: active ? 'none' : '0.5px solid #1a2f4a',
                }}
              >
                {r}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onConfirm(role)}
          disabled={busy}
          style={{
            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
            backgroundColor: busy ? '#1a2f4a' : '#00d4ff', color: '#04091a',
            fontSize: '14px', fontWeight: '700', cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Joining…' : `Join as ${role}`}
        </button>
      </div>
    </div>
  );
}
