import { useState } from 'react';
import { Workflow, Sparkles, ArrowUpCircle, Scale, Send, Users, PauseCircle, Flag,
         CheckCircle, AlertTriangle, Loader2, Copy } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './ToastProvider';
import { coordinateResolution } from '../agents/resolutionCoordinator';

const ACCENT = '#a855f7'; // coordinator's distinct accent (the autonomous decision agent)

// Per-action icon so the decision chain is scannable at a glance.
const ACTION_ICON = {
  escalate: ArrowUpCircle,
  draft_rti: Scale,
  reroute: Send,
  request_verification: Users,
  wait: PauseCircle,
  done: Flag,
};

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={13} color="#00d4ff" strokeWidth={2} style={{ animation: 'spin 0.9s linear infinite' }} />;
  if (status === 'error') return <AlertTriangle size={13} color="#f97316" strokeWidth={2} />;
  return <CheckCircle size={13} color="#16a34a" strokeWidth={2} />;
}

// One decision in the coordinator's live reasoning chain (connected vertical timeline).
function DecisionRow({ step, last }) {
  const Icon = ACTION_ICON[step.action] || Workflow;
  const running = step.status === 'running';
  return (
    <div className="anim-fade-in" style={{ display: 'flex', gap: '12px', position: 'relative', paddingBottom: last ? '2px' : '14px' }}>
      <div className={running ? 'coord-thinking' : undefined} style={{
        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, zIndex: 1,
        backgroundColor: ACCENT + '20', border: `1px solid ${ACCENT}66`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} color={ACCENT} strokeWidth={1.8}
          style={running ? { animation: 'pulse 1.2s ease-in-out infinite' } : undefined} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#f0f6ff' }}>{step.name}</span>
          <span style={{ flexShrink: 0 }}><StatusIcon status={step.status} /></span>
        </div>
        {step.summary && (
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.45 }}>{step.summary}</div>
        )}
        {step.detail && (
          <div style={{
            fontSize: '11.5px', color: ACCENT, marginTop: '5px', lineHeight: 1.45,
            backgroundColor: ACCENT + '12', border: `0.5px solid ${ACCENT}26`,
            borderRadius: '8px', padding: '6px 9px',
          }}>{step.detail}</div>
        )}
      </div>
    </div>
  );
}

// Trigger + live reasoning trace for the autonomous Resolution Coordinator (Agent 7).
// Visibility is controlled by the parent (owner on IssueDetail, authority on the
// Authority Dashboard); this component only runs when there is a signed-in user.
export default function CoordinatorPanel({ issue }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);

  if (!issue?.id || issue.status === 'Resolved') return null;

  const run = async () => {
    if (busy || !user?.uid) {
      if (!user?.uid) toast.show('Sign in to run the coordinator', 'error');
      return;
    }
    setBusy(true);
    setSteps([]);
    setResult(null);
    try {
      const res = await coordinateResolution({ ...issue }, { user, onStep: setSteps });
      setResult(res);
      if (res?.error) toast.show('Coordinator could not finish', 'error');
      else toast.show(res?.summary || 'Coordinator finished', 'success');
    } catch (err) {
      console.error('[CoordinatorPanel]:', err);
      toast.show('Coordinator failed to run', 'error');
    }
    setBusy(false);
  };

  const copyRTI = async () => {
    try {
      await navigator.clipboard.writeText(result.rtiDraft);
      toast.show('RTI draft copied', 'success');
    } catch { toast.show('Could not copy', 'error'); }
  };

  return (
    <div className="anim-fade-in" style={{
      backgroundColor: '#0d1b2e', borderRadius: '14px',
      border: `0.5px solid ${ACCENT}66`, padding: '16px', marginBottom: '10px',
      boxShadow: `0 12px 34px -20px ${ACCENT}`,
      backgroundImage: `radial-gradient(120% 80% at 100% 0%, ${ACCENT}14 0%, transparent 45%)`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
            backgroundColor: ACCENT + '1f', border: `0.5px solid ${ACCENT}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Workflow size={17} color={ACCENT} strokeWidth={1.6} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#f0f6ff' }}>AI Resolution Coordinator</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                fontSize: '9px', fontWeight: '700', letterSpacing: '0.6px', textTransform: 'uppercase',
                color: ACCENT, backgroundColor: ACCENT + '1a', border: `0.5px solid ${ACCENT}40`,
                borderRadius: '999px', padding: '2px 7px',
              }}>
                <Sparkles size={9} strokeWidth={2} /> Autonomous
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#4a6280', marginTop: '1px' }}>Reasons &amp; acts, step by step</div>
          </div>
        </div>
        <button onClick={run} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
          backgroundColor: busy ? '#1a2f4a' : ACCENT, color: busy ? '#7c8aa5' : '#0b0518',
          border: 'none', borderRadius: '10px', padding: '9px 14px',
          fontSize: '13px', fontWeight: '700', cursor: busy ? 'default' : 'pointer',
        }}>
          {busy
            ? <Loader2 size={14} strokeWidth={2.2} style={{ animation: 'spin 0.9s linear infinite' }} />
            : <Sparkles size={14} strokeWidth={2.2} />}
          {busy ? 'Coordinating…' : steps.length ? 'Re-run' : 'Run Coordinator'}
        </button>
      </div>

      {/* Pre-first-step "thinking" placeholder */}
      {busy && steps.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginTop: '14px',
          paddingTop: '12px', borderTop: '0.5px solid #1a2f4a' }}>
          <div className="coord-thinking" style={{
            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            backgroundColor: ACCENT + '20', border: `1px solid ${ACCENT}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Workflow size={14} color={ACCENT} style={{ animation: 'pulse 1.2s ease-in-out infinite' }} />
          </div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Reasoning over the issue…</span>
        </div>
      )}

      {/* Live reasoning chain — connected vertical timeline */}
      {steps.length > 0 && (
        <div style={{ position: 'relative', marginTop: '14px', paddingTop: '14px', borderTop: '0.5px solid #1a2f4a' }}>
          <div style={{ position: 'absolute', left: '13px', top: '24px', bottom: '14px', width: '1px', backgroundColor: '#26324c' }} />
          {steps.map((step, i) => <DecisionRow key={i} step={step} last={i === steps.length - 1} />)}
        </div>
      )}

      {/* Outcome summary */}
      {result && !result.error && (
        <div style={{
          marginTop: '12px', backgroundColor: '#112035', borderRadius: '10px',
          border: `0.5px solid ${ACCENT}33`, padding: '11px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={12} color={ACCENT} strokeWidth={1.8} />
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#4a6280',
              textTransform: 'uppercase', letterSpacing: '0.7px' }}>Coordinator summary</span>
          </div>
          <div style={{ fontSize: '12.5px', color: '#f0f6ff', marginTop: '5px', lineHeight: 1.5 }}>{result.summary}</div>
          {result.rtiDraft && (
            <button onClick={copyRTI} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px',
              background: 'none', border: `0.5px solid ${ACCENT}`, borderRadius: '8px',
              padding: '7px 11px', color: ACCENT, fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}>
              <Copy size={12} strokeWidth={1.5} /> Copy RTI draft
            </button>
          )}
        </div>
      )}
    </div>
  );
}
