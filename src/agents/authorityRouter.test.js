import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(() => ({})),
}));
vi.mock('../utils/gemini', () => ({
  callGeminiFunction: vi.fn(),
  callGeminiText: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));
vi.mock('../utils/n8n', () => ({ triggerN8N: vi.fn(async () => ({ ok: true })) }));

import { routeToAuthority } from './authorityRouter';
import { callGeminiFunction, callGeminiText } from '../utils/gemini';
import { triggerN8N } from '../utils/n8n';
import { getDocs } from 'firebase/firestore';

const issue = {
  issueType: 'Pothole', severity: 'High', city: 'Bengaluru',
  description: 'Deep pothole', locationText: 'MG Road', userName: 'A', userEmail: 'a@b.com',
};

describe('routeToAuthority (ReAct loop)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grounds in the catalog, finalizes routing and emails the authority', async () => {
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'lookup_department', reasoning: 'check catalog' })
      .mockResolvedValueOnce({
        action: 'finalize_routing', departmentName: 'Roads & Infrastructure Department',
        urgencyLevel: 'Urgent', slaHours: 72, officerTitle: 'Executive Engineer',
        emailSubject: 'Pothole complaint', reasoning: 'commit',
      });

    const r = await routeToAuthority(issue, 'doc1');

    expect(r.departmentName).toBe('Roads & Infrastructure Department');
    expect(r.urgencyLevel).toBe('Urgent');
    expect(r.emailSent).toBe(true);
    expect(Array.isArray(r.trace)).toBe(true);
    expect(r.trace).toHaveLength(2);
    expect(triggerN8N).toHaveBeenCalledWith('authority_email', expect.objectContaining({ issueId: 'doc1' }));
  });

  it('uses the prior-routings tool (queries Firestore) before finalizing', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ routedTo: { departmentName: 'Roads & Infrastructure Department' }, status: 'Resolved' }) },
        { data: () => ({ routedTo: { departmentName: 'Roads & Infrastructure Department' }, status: 'Reported' }) },
      ],
    });
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'check_prior_routings', reasoning: 'history' })
      .mockResolvedValueOnce({ action: 'finalize_routing', departmentName: 'Roads & Infrastructure Department', reasoning: 'commit' });

    const r = await routeToAuthority(issue, 'doc2');

    expect(getDocs).toHaveBeenCalled();
    expect(r.departmentName).toBe('Roads & Infrastructure Department');
    expect(r.emailSent).toBe(true);
  });

  it('falls back to the catalog department when the model never finalizes', async () => {
    callGeminiFunction.mockResolvedValue({ action: 'lookup_department', reasoning: 'loop' });

    const r = await routeToAuthority(issue, 'doc3');

    expect(r.departmentName).toBe('Roads & Infrastructure Department');
    expect(r.slaHours).toBe(72);
    expect(r.emailSent).toBe(true);
    expect(triggerN8N).toHaveBeenCalled();
  });

  it('still routes deterministically when the reasoning model is unreachable', async () => {
    callGeminiFunction.mockRejectedValue(new Error('down'));
    callGeminiText.mockRejectedValue(new Error('down too'));

    const r = await routeToAuthority(issue, 'doc4');

    expect(r.departmentName).toBe('Roads & Infrastructure Department');
    expect(r.emailSent).toBe(true);
  });
});
