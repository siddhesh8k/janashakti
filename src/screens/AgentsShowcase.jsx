import { useState, Fragment } from 'react';
import { Bot, Search, MailCheck, BarChart3, ChevronRight, ChevronDown,
         Zap, CheckCircle, AlertTriangle, Clock, ShieldCheck, Leaf,
         Camera, Database, Target, Workflow } from 'lucide-react';
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
  {
    num: 7, key: 'coordinator', icon: Workflow, name: 'Resolution Coordinator', color: '#a855f7',
    desc: 'An autonomous agent that reasons over a stalled issue in a multi-step loop — deciding, step by step, whether to escalate, draft an RTI, re-route, or request verification. It executes each tool for real, observes the result, and adapts its next move. Built on Gemini function-calling.',
    statKey: 'coordinated',
    tech: 'Google AI Studio · Gemini 2.5 Flash · function-calling (ReAct loop)',
    statText: 'issues coordinated',
  },
];

const AGENT_ICON = { analyzer: Bot, detector: Search, router: MailCheck, predictor: BarChart3, coordinator: Workflow };
const AGENT_COLOR = { analyzer: '#00d4ff', detector: '#3b82f6', router: '#16a34a', predictor: '#f97316', coordinator: '#a855f7' };
const FLOW = ['Photo', 'Analyzer', 'Detector', 'Router', 'Predictor', 'Saved', 'Resolved', 'ESG Score', 'SDG Tagged'];

// Icon + colour per pipeline step (drives the scrollable flow rail).
const STEP_META = {
  Photo:        { icon: Camera, color: '#94a3b8' },
  Analyzer:     { icon: Bot, color: '#00d4ff' },
  Detector:     { icon: Search, color: '#3b82f6' },
  Router:       { icon: MailCheck, color: '#16a34a' },
  Predictor:    { icon: BarChart3, color: '#f97316' },
  Saved:        { icon: Database, color: '#94a3b8' },
  Resolved:     { icon: CheckCircle, color: '#16a34a' },
  'ESG Score':  { icon: Leaf, color: '#4C9F38' },
  'SDG Tagged': { icon: Target, color: '#FD9D24' },
};

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

        {/* Live stats — 6 in a 3-col grid (2 even rows), then a full-width spotlight tile
            for the autonomous Agent 7 (balances the grid + highlights the new capability). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
          <StatsCard label="Analyzed" value={stats.analyzed} color="#00d4ff" />
          <StatsCard label="Dupes" value={stats.duplicatesCaught} color="#3b82f6" />
          <StatsCard label="Routed" value={stats.authoritiesNotified} color="#16a34a" />
          <StatsCard label="Predicted" value={stats.predictionsGenerated} color="#f97316" />
          <StatsCard label="Verified" value={stats.resolutionsVerified} color="#8b5cf6" />
          <StatsCard label="ESG Scored" value={stats.esgScored} color="#4C9F38" />
        </div>
        <div className="lift-card" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          backgroundColor: '#0d1b2e', borderRadius: '12px', border: '0.5px solid #a855f766',
          padding: '12px 14px', marginBottom: '20px',
          backgroundImage: 'radial-gradient(120% 130% at 100% 0%, #a855f714 0%, transparent 50%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
              backgroundColor: '#a855f71f', border: '0.5px solid #a855f755',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Workflow size={18} color="#a855f7" strokeWidth={1.6} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#f0f6ff' }}>Autonomous Coordinator</div>
              <div style={{ fontSize: '11px', color: '#4a6280' }}>Agent 7 · reasons &amp; acts in a loop</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#a855f7', lineHeight: 1 }}>{stats.coordinated}</div>
            <div style={{ fontSize: '10px', color: '#4a6280' }}>coordinated</div>
          </div>
        </div>

        {/* Agent Cards — each shows its latest live reasoning */}
        {AGENTS.map(agent => {
          const Icon = agent.icon;
          const last = latestStepFor(agent.key);
          return (
            <div key={agent.num} className="lift-card" style={{
              backgroundColor: '#0d1b2e', borderRadius: '14px',
              border: `0.5px solid ${agent.color}26`, padding: '16px',
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
              No pipeline runs yet. Report an issue to watch the agents collaborate.
            </p>
          </div>
        ) : (
          recentRuns.map(run => {
            const isOpen = openRun === run.id;
            return (
              <div key={run.id} className="lift-card" style={{
                backgroundColor: '#0d1b2e', borderRadius: '14px',
                border: `0.5px solid ${run.kind === 'coordinator' ? '#a855f766' : '#1a2f4a'}`,
                marginBottom: '10px', overflow: 'hidden',
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
          {/* Scrollable rail — content-width chips with per-step icons keep every label
              fully readable on mobile (swipe horizontally), instead of truncating to "…". */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px',
            overflowX: 'auto', paddingBottom: '8px',
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          }}>
            {FLOW.map((step, i) => {
              const meta = STEP_META[step] || { icon: Bot, color: '#00d4ff' };
              const StepIcon = meta.icon;
              return (
                <Fragment key={step}>
                  <div style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                    backgroundColor: '#112035', border: `0.5px solid ${meta.color}55`,
                    borderRadius: '10px', padding: '8px 12px',
                  }}>
                    <StepIcon size={13} color={meta.color} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#f0f6ff' }}>{step}</span>
                  </div>
                  {i < FLOW.length - 1 && (
                    <ChevronRight size={14} color="#00d4ff66" strokeWidth={2} style={{ flexShrink: 0 }} />
                  )}
                </Fragment>
              );
            })}
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
            Gemini 2.5 Flash — 7 agents, orchestrated + autonomous, zero manual effort
          </p>
        </div>
      </div>
    </div>
  );
}
