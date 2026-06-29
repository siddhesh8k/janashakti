import { useState, Fragment } from 'react';
import { Bot, Search, MailCheck, BarChart3, ChevronRight, ChevronDown,
         Zap, CheckCircle, AlertTriangle, Clock, ShieldCheck, Leaf } from 'lucide-react';
import { useAgents } from '../hooks/useAgents';
import TopNav from '../components/TopNav';
import StatsCard from '../components/StatsCard';
import LoadingSkeleton from '../components/LoadingSkeleton';

const AGENTS = [
  {
    num: 1, key: 'analyzer', icon: Bot, name: 'Issue Analyzer', color: '#00d4ff',
    desc: 'Analyzes civic issue photos using Gemini 2.5 Flash vision. Identifies issue type, severity, generates formal complaint letters, and extracts legal rights. Self-checks its confidence and re-examines once if unsure.',
    statKey: 'analyzed',
  },
  {
    num: 2, key: 'detector', icon: Search, name: 'Duplicate Detector', color: '#3b82f6',
    desc: 'Checks for duplicate reports within 200m radius using geo-proximity and AI similarity analysis. Prevents spam and aggregates community confirmations.',
    statKey: 'duplicatesCaught',
  },
  {
    num: 3, key: 'router', icon: MailCheck, name: 'Authority Router', color: '#16a34a',
    desc: 'Routes issues to the correct government department and officer. Sends formal complaint emails automatically via n8n workflows.',
    statKey: 'authoritiesNotified',
  },
  {
    num: 4, key: 'predictor', icon: BarChart3, name: 'Resolution Predictor', color: '#f97316',
    desc: 'Predicts resolution timeline, priority score, and escalation risk — using the routed department, community pressure, and escalation data passed from the other agents.',
    statKey: 'predictionsGenerated',
  },
  {
    num: 5, key: 'verifier', icon: ShieldCheck, name: 'Resolution Verifier', color: '#16a34a',
    desc: 'When an authority uploads a fix photo, Gemini vision checks it genuinely shows the issue resolved — flagging fake or unrelated photos instead of trusting them blindly.',
    statKey: 'resolutionsVerified',
  },
  {
    num: 6, key: 'esg_scorer', icon: Leaf, name: 'ESG Impact Scorer', color: '#4C9F38',
    desc: 'After every issue is resolved, Gemini 2.5 Flash analyzes the civic impact and generates an ESG score across Environmental, Social, and Governance dimensions. Issues are mapped to UN Sustainable Development Goals automatically.',
    statKey: 'esgScored',
    tech: 'Google AI Studio · Gemini 2.5 Flash · UN SDG Framework',
    statText: 'issues ESG scored',
  },
];

const AGENT_ICON = { analyzer: Bot, detector: Search, router: MailCheck, predictor: BarChart3 };
const AGENT_COLOR = { analyzer: '#00d4ff', detector: '#3b82f6', router: '#16a34a', predictor: '#f97316' };
const FLOW = ['Photo', 'Analyzer', 'Detector', 'Router', 'Predictor', 'Saved', 'Resolved', 'ESG Score', 'SDG Tagged'];

const timeAgo = (ts) => {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

function StepStatus({ status }) {
  if (status === 'error') return <AlertTriangle size={13} color="#f97316" strokeWidth={2} />;
  return <CheckCircle size={13} color="#16a34a" strokeWidth={2} />;
}

// One agent's reasoning row inside a run's trace.
function StepRow({ step }) {
  const Icon = AGENT_ICON[step.agent] || Bot;
  const color = AGENT_COLOR[step.agent] || '#00d4ff';
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '8px 0' }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
        backgroundColor: color + '1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} color={color} strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#f0f6ff' }}>{step.name}</span>
          <span style={{ flexShrink: 0 }}><StepStatus status={step.status} /></span>
        </div>
        {step.summary && (
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{step.summary}</div>
        )}
        {step.detail && (
          <div style={{ fontSize: '11px', color: '#4a6280', marginTop: '1px', lineHeight: 1.4 }}>{step.detail}</div>
        )}
      </div>
    </div>
  );
}

export default function AgentsShowcase() {
  const { stats, recentRuns, loading } = useAgents();
  const [openRun, setOpenRun] = useState(null);

  // Most recent reasoning step for a given agent across recent runs.
  const latestStepFor = (key) => {
    for (const run of recentRuns) {
      const step = (run.steps || []).find((s) => s.agent === key);
      if (step) return step;
    }
    return null;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="AI Intelligence" showBack />
      <div style={{ padding: '16px' }}><LoadingSkeleton count={4} /></div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080f1e' }}>
      <TopNav title="AI Intelligence" showBack />
      <div style={{ padding: '16px' }}>

        {/* ESG Intelligence summary */}
        <div style={{
          backgroundColor: '#16a34a20', borderRadius: '14px',
          border: '0.5px solid #16a34a40', padding: '16px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Leaf size={18} color="#4C9F38" strokeWidth={1.5} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#f0f6ff' }}>ESG Intelligence Active</span>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
            Every resolved issue generates verified ESG scores aligned with UN Sustainable Development Goals.
          </p>
        </div>

        {/* Live stats */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          <StatsCard label="Analyzed" value={stats.analyzed} color="#00d4ff" />
          <StatsCard label="Dupes" value={stats.duplicatesCaught} color="#3b82f6" />
          <StatsCard label="Routed" value={stats.authoritiesNotified} color="#16a34a" />
          <StatsCard label="Predicted" value={stats.predictionsGenerated} color="#f97316" />
          <StatsCard label="ESG Scored" value={stats.esgScored} color="#4C9F38" />
        </div>

        {/* Agent Cards — each shows its latest live reasoning */}
        {AGENTS.map(agent => {
          const Icon = agent.icon;
          const last = latestStepFor(agent.key);
          return (
            <div key={agent.num} style={{
              backgroundColor: '#0d1b2e', borderRadius: '14px',
              border: '0.5px solid #1a2f4a', padding: '16px',
              marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                    backgroundColor: agent.color + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: '700', color: agent.color,
                  }}>{agent.num}</div>
                  <Icon size={24} color={agent.color} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                  <span title={agent.name} style={{ fontSize: '15px', fontWeight: '600', color: '#f0f6ff',
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.name}
                  </span>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: '600', color: '#16a34a', flexShrink: 0,
                  backgroundColor: '#16a34a1a', padding: '2px 8px',
                  borderRadius: '999px',
                }}>ACTIVE</span>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6,
                          marginBottom: '10px' }}>
                {agent.desc}
              </p>

              {/* Latest reasoning trace for this agent */}
              {last && (
                <div style={{
                  backgroundColor: '#112035', borderRadius: '10px',
                  border: `0.5px solid ${agent.color}33`, padding: '10px', marginBottom: '10px',
                }}>
                  <span style={{ fontSize: '10px', fontWeight: '500', color: '#4a6280',
                                 textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                    Latest reasoning
                  </span>
                  <div style={{ fontSize: '12px', color: '#f0f6ff', fontWeight: '600', marginTop: '4px' }}>
                    {last.summary}
                  </div>
                  {last.detail && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.4 }}>
                      {last.detail}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#4a6280' }}>
                  {agent.tech || 'Powered by: Gemini 2.5 Flash + Firebase'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: agent.color }}>
                  {stats[agent.statKey]} {agent.statText || 'runs'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Recent pipeline runs — tap to expand the full agent-to-agent trace */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginTop: '20px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#f0f6ff' }}>
            Recent Pipeline Runs
          </span>
        </div>

        {recentRuns.length === 0 ? (
          <div style={{
            backgroundColor: '#0d1b2e', borderRadius: '14px', border: '0.5px solid #1a2f4a',
            padding: '20px', textAlign: 'center',
          }}>
            <Bot size={28} color="#4a6280" strokeWidth={1} style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#4a6280' }}>
              No pipeline runs yet. Report an issue to watch all 4 agents collaborate.
            </p>
          </div>
        ) : (
          recentRuns.map(run => {
            const isOpen = openRun === run.id;
            return (
              <div key={run.id} style={{
                backgroundColor: '#0d1b2e', borderRadius: '14px',
                border: '0.5px solid #1a2f4a', marginBottom: '10px', overflow: 'hidden',
              }}>
                <button onClick={() => setOpenRun(isOpen ? null : run.id)} style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 16px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {isOpen
                      ? <ChevronDown size={16} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                      : <ChevronRight size={16} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />}
                    <span title={`${run.issueType || 'Issue'}${run.severity ? ` · ${run.severity}` : ''}`}
                          style={{ fontSize: '13px', fontWeight: '600', color: '#f0f6ff',
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.issueType || 'Issue'}{run.severity ? ` · ${run.severity}` : ''}
                    </span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                                 fontSize: '11px', color: '#4a6280' }}>
                    <Clock size={11} strokeWidth={1.5} />
                    {timeAgo(run.createdAt)}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 16px 12px' }}>
                    {(run.steps || []).map((step, i) => <StepRow key={i} step={step} />)}
                    {typeof run.durationMs === 'number' && (
                      <div style={{ fontSize: '10px', color: '#4a6280', marginTop: '6px',
                                    textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                        Pipeline completed in {(run.durationMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Flow Diagram */}
        <div style={{ marginTop: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#4a6280',
                         textTransform: 'uppercase', letterSpacing: '0.7px' }}>
            AGENT PIPELINE
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            width: '100%', gap: '4px', rowGap: '8px', marginTop: '12px',
          }}>
            {FLOW.map((step, i) => (
              <Fragment key={step}>
                <div title={step} style={{
                  flex: 1, minWidth: '54px',
                  backgroundColor: '#112035', border: '0.5px solid #00d4ff40',
                  borderRadius: '8px', padding: '8px 4px',
                  fontSize: '11px', fontWeight: '600', color: '#00d4ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                }}>
                  {step === 'ESG Score' && <Leaf size={11} color="#00d4ff" strokeWidth={1.5} style={{ flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step}</span>
                </div>
                {i < FLOW.length - 1 && (
                  <ChevronRight size={13} color="#00d4ff40" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Powered by */}
        <div style={{
          backgroundColor: '#0d1b2e', borderRadius: '14px',
          border: '0.5px solid #1a2f4a', padding: '16px',
          marginTop: '20px', textAlign: 'center',
        }}>
          <Zap size={20} color="#00d4ff" strokeWidth={1.5} style={{ marginBottom: '8px' }} />
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff', marginBottom: '4px' }}>
            Powered by Google AI Studio
          </p>
          <p style={{ fontSize: '12px', color: '#86efac' }}>
            Gemini 2.5 Flash — 4 agents, orchestrated, zero manual effort
          </p>
        </div>
      </div>
    </div>
  );
}
