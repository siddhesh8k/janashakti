import { callGeminiFunction, callGeminiText } from '../utils/gemini';

// ── Shared bounded ReAct loop ───────────────────────────────────────────────────
// The agent primitive behind JanaShakti's autonomous agents. Each turn the model is
// shown the task, the action menu, and everything it has observed so far, and it picks
// ONE next action (typed via a Gemini function declaration). The caller's `runTool`
// executes that action FOR REAL and returns an observation, which is fed back into the
// next turn's prompt — reason → act → observe → reason again — until a tool reports it
// is `done` (terminal) or the iteration budget is spent.
//
// Returns { trace, result, history }:
//   • trace   — UI-renderable steps { agent, action, name, summary, detail, status },
//               the exact shape AgentsShowcase's StepRow / CoordinatorPanel's DecisionRow
//               already render, so reasoning chains surface with no new UI plumbing.
//   • result  — the payload the terminal tool returned (or null if never reached).
//   • history — [{ action, reasoning, observation }] fed back across turns.
//
// The Resolution Coordinator (Agent 7) predates this helper but follows the same shape.

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);

// One decision: native function-calling first, JSON-in-prose fallback (proxy / fn failure).
const decide = async (fnDeclaration, prompt, timeoutMs) => {
  try {
    return await withTimeout(callGeminiFunction(fnDeclaration, prompt), timeoutMs, 'decision');
  } catch (fnErr) {
    console.error('[reactLoop fn → JSON fallback]:', fnErr.message);
    const props = fnDeclaration?.parameters?.properties || {};
    const shape = Object.keys(props).map((k) => `"${k}": ...`).join(', ');
    const jsonPrompt = `${prompt}\n\nReturn ONLY valid JSON: { ${shape} }`;
    return await withTimeout(callGeminiText(jsonPrompt), timeoutMs, 'decision (json)');
  }
};

export const runReActLoop = async ({
  fnDeclaration,            // Gemini FunctionDeclaration the decision is typed against
  buildPrompt,              // (history, ctx, meta) => string  (meta = { iteration, maxIterations, isLast })
  runTool,                  // async (action, decision, ctx) => { observation, done?, result? }
  maxIterations = 3,
  decisionTimeoutMs = 12000,
  agentKey = 'agent',
  agentName = 'Agent',
  labelFor,                 // optional (action, decision) => string  (display name per step)
  onStep,                   // optional (traceSnapshot) => void  (live streaming)
  ctx = {},
} = {}) => {
  const trace = [];
  const history = [];
  let result = null;

  const emit = (i, patch) => {
    trace[i] = { ...(trace[i] || { agent: agentKey }), ...patch };
    if (onStep) onStep(trace.map((s) => ({ ...s })));
  };

  for (let i = 0; i < maxIterations; i++) {
    const meta = { iteration: i, maxIterations, isLast: i === maxIterations - 1 };
    const prompt = buildPrompt(history, ctx, meta);

    let decision;
    try {
      decision = await decide(fnDeclaration, prompt, decisionTimeoutMs);
    } catch (e) {
      emit(trace.length, {
        agent: agentKey, name: agentName, action: 'error', status: 'error',
        summary: 'Could not reach the reasoning model.', detail: e.message,
      });
      break;
    }

    const action = decision?.action;
    const reasoning = decision?.reasoning || '';
    const idx = trace.length;
    const name = (labelFor && labelFor(action, decision)) || action || agentName;
    emit(idx, { agent: agentKey, action, name, status: 'running', summary: reasoning });

    let toolOut;
    try {
      toolOut = await runTool(action, decision, ctx);
    } catch (err) {
      console.error(`[reactLoop tool ${action}]:`, err.message);
      toolOut = { observation: `Action "${action}" failed: ${err.message}.` };
    }

    const observation = toolOut?.observation || '';
    emit(idx, { status: 'done', detail: observation });
    history.push({ action, reasoning, observation });

    if (toolOut && 'result' in toolOut && toolOut.result !== undefined) result = toolOut.result;
    if (toolOut?.done) break;
  }

  return { trace, result, history };
};
