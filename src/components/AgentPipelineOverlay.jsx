import { Bot, Search, MailCheck, BarChart3, Loader2, CheckCircle, AlertTriangle, Circle } from 'lucide-react';

// Maps each pipeline step's agent key to its Lucide icon (per CLAUDE.md).
const AGENT_ICON = {
  analyzer: Bot,
  detector: Search,
  router: MailCheck,
  predictor: BarChart3,
};

const AGENT_COLOR = {
  analyzer: '#00d4ff',
  detector: '#3b82f6',
  router: '#16a34a',
  predictor: '#f97316',
};

function StatusGlyph({ status }) {
  if (status === 'running') {
    return <Loader2 size={16} color="#00d4ff" strokeWidth={2}
      style={{ animation: 'spin 1s linear infinite' }} />;
  }
  if (status === 'done') return <CheckCircle size={16} color="#16a34a" strokeWidth={2} />;
  if (status === 'error') return <AlertTriangle size={16} color="#f97316" strokeWidth={2} />;
  return <Circle size={16} color="#7689a3" strokeWidth={1.5} />;
}

// Full-screen overlay that renders the live agent pipeline trace during submit, so
// the user (and judges) can watch the agents reason and collaborate in real time.
export default function AgentPipelineOverlay({ steps = [], visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(4, 9, 26, 0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#0d1b2e', borderRadius: '14px',
        border: '0.5px solid #00d4ff40', padding: '18px',
        width: '100%', maxWidth: '420px', animation: 'popIn 0.25s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Bot size={18} color="#00d4ff" strokeWidth={1.5} />
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff' }}>AI agents at work</span>
        </div>
        <p style={{ fontSize: '12px', color: '#7689a3', marginBottom: '12px' }}>
          4 agents analysing, de-duplicating, routing and predicting — collaborating in real time.
        </p>

        {steps.map((s, idx) => {
          const Icon = AGENT_ICON[s.agent] || Bot;
          const color = AGENT_COLOR[s.agent] || '#00d4ff';
          const active = s.status === 'running';
          return (
            <div key={s.agent} style={{
              display: 'flex', gap: '10px', padding: '10px 0',
              borderBottom: idx < steps.length - 1 ? '0.5px solid #1a2f4a' : 'none',
              opacity: s.status === 'pending' ? 0.5 : 1,
            }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                backgroundColor: color + '1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: active ? 'pulse 1.4s ease-in-out infinite' : 'none',
              }}>
                <Icon size={16} color={color} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#f0f6ff' }}>{s.name}</span>
                  <span style={{ flexShrink: 0 }}><StatusGlyph status={s.status} /></span>
                </div>
                {s.summary && (
                  <div title={s.summary} style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.summary}
                  </div>
                )}
                {s.detail && (
                  <div style={{ fontSize: '11px', color: '#7689a3', marginTop: '2px', lineHeight: 1.4 }}>
                    {s.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
