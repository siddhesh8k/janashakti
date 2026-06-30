import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/gemini', () => ({
  callGeminiFunction: vi.fn(),
  callGeminiText: vi.fn(),
}));

import { runReActLoop } from './reactLoop';
import { callGeminiFunction, callGeminiText } from '../utils/gemini';

const FN = {
  name: 'step',
  parameters: { type: 'OBJECT', properties: { action: { type: 'STRING' }, reasoning: { type: 'STRING' } }, required: ['action'] },
};

describe('runReActLoop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stops at the terminal tool and returns its result', async () => {
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'look', reasoning: 'gather' })
      .mockResolvedValueOnce({ action: 'finish', reasoning: 'enough' });

    const runTool = vi.fn(async (action) =>
      action === 'finish'
        ? { observation: 'done now', done: true, result: { ok: true } }
        : { observation: 'looked' });

    const { result, trace, history } = await runReActLoop({
      fnDeclaration: FN,
      buildPrompt: () => 'prompt',
      runTool,
      maxIterations: 5,
    });

    expect(result).toEqual({ ok: true });
    expect(history.map((h) => h.action)).toEqual(['look', 'finish']);
    expect(trace).toHaveLength(2);
    expect(trace.every((s) => s.status === 'done')).toBe(true);
    expect(callGeminiFunction).toHaveBeenCalledTimes(2);
  });

  it('respects the maxIterations cap when no tool reports done', async () => {
    callGeminiFunction.mockResolvedValue({ action: 'look', reasoning: 'again' });
    const runTool = vi.fn(async () => ({ observation: 'still looking' }));

    const { history, result } = await runReActLoop({
      fnDeclaration: FN, buildPrompt: () => 'p', runTool, maxIterations: 3,
    });

    expect(history).toHaveLength(3);
    expect(runTool).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  });

  it('falls back to JSON text when function-calling throws (e.g. proxy)', async () => {
    callGeminiFunction.mockRejectedValue(new Error('unsupported via proxy'));
    callGeminiText.mockResolvedValue({ action: 'finish', reasoning: 'json path' });
    const runTool = vi.fn(async () => ({ observation: 'k', done: true, result: 1 }));

    const { result } = await runReActLoop({
      fnDeclaration: FN, buildPrompt: () => 'p', runTool, maxIterations: 2,
    });

    expect(callGeminiText).toHaveBeenCalled();
    expect(result).toBe(1);
  });

  it('records a tool that throws as an observation and keeps going', async () => {
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'boom', reasoning: 'try' })
      .mockResolvedValueOnce({ action: 'finish', reasoning: 'recover' });
    const runTool = vi.fn(async (action) => {
      if (action === 'boom') throw new Error('kaboom');
      return { observation: 'ok', done: true, result: 'recovered' };
    });

    const { result, history } = await runReActLoop({
      fnDeclaration: FN, buildPrompt: () => 'p', runTool, maxIterations: 3,
    });

    expect(history[0].observation).toContain('kaboom');
    expect(result).toBe('recovered');
  });

  it('streams live trace snapshots via onStep', async () => {
    callGeminiFunction.mockResolvedValueOnce({ action: 'finish', reasoning: 'r' });
    const runTool = vi.fn(async () => ({ observation: 'o', done: true, result: true }));
    const snaps = [];

    await runReActLoop({
      fnDeclaration: FN, buildPrompt: () => 'p', runTool, maxIterations: 2,
      onStep: (s) => snaps.push(s),
    });

    expect(snaps.length).toBeGreaterThan(1);          // running → done
    expect(snaps[0]).not.toBe(snaps[snaps.length - 1]); // independent copies
  });
});
