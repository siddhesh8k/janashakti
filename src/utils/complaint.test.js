import { describe, it, expect } from 'vitest';
import { buildComplaintLetter } from './complaint';

const todayIN = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const full = {
  name: 'Asha Rao',
  contact: 'asha@example.com',
  address: '12th Main, Indiranagar, Bangalore',
  issueType: 'Pothole',
  severity: 'High',
  department: 'BBMP Roads',
  body: 'There is a deep pothole that has been damaging vehicles for weeks.',
};

describe('buildComplaintLetter', () => {
  it('includes issue type and severity in the subject line', () => {
    const out = buildComplaintLetter(full);
    expect(out).toContain('Subject: Complaint regarding Pothole (High severity)');
  });

  it('includes the department, location, reporter name and contact', () => {
    const out = buildComplaintLetter(full);
    expect(out).toContain('BBMP Roads');
    expect(out).toContain('Location of the issue: 12th Main, Indiranagar, Bangalore');
    expect(out).toContain('Asha Rao');
    expect(out).toContain('Email: asha@example.com');
  });

  it('stamps the complaint with today\'s date in en-IN format', () => {
    const out = buildComplaintLetter(full);
    expect(out).toContain(`Date: ${todayIN}`);
  });

  it('carries the cleaned AI body through into the letter', () => {
    const out = buildComplaintLetter(full);
    expect(out).toContain('There is a deep pothole that has been damaging vehicles for weeks.');
  });

  it('omits the severity parenthetical when severity is missing', () => {
    const out = buildComplaintLetter({ ...full, severity: undefined });
    expect(out).toContain('Subject: Complaint regarding Pothole');
    expect(out).not.toContain('severity)');
  });

  it('falls back gracefully on every missing field', () => {
    const out = buildComplaintLetter({});
    expect(out).toContain('Subject: Complaint regarding a civic issue');
    expect(out).toContain('Municipal Corporation'); // default department
    expect(out).toContain('Location of the issue: As per attached details');
    expect(out).toContain('Concerned Citizen'); // default signer
    // No contact line when no contact supplied.
    expect(out).not.toContain('Email:');
  });

  it('uses a default body sentence when the AI body is empty', () => {
    const out = buildComplaintLetter({ ...full, body: '' });
    expect(out).toContain('I wish to report the civic issue described above for your urgent attention.');
  });

  it('strips the model\'s own subject / greeting / sign-off lines from the body', () => {
    const noisy = [
      'Subject: Pothole on MG Road',
      'Dear Sir,',
      'The road has a dangerous pothole that needs urgent repair.',
      'Yours faithfully,',
      'John Doe',
    ].join('\n');

    const out = buildComplaintLetter({ ...full, body: noisy });

    // The substantive sentence survives…
    expect(out).toContain('The road has a dangerous pothole that needs urgent repair.');
    // …but the model's duplicate subject/greeting line does not appear inside the body.
    expect(out).not.toContain('Subject: Pothole on MG Road');
    expect(out).not.toContain('Dear Sir,');
  });

  it('rewrites bracketed location placeholders into neutral phrasing', () => {
    const out = buildComplaintLetter({
      ...full,
      body: 'The issue is at [Specific Location near XYZ] and is worsening.',
    });
    expect(out).toContain('the location shown in the attached image');
    expect(out).not.toContain('[Specific Location near XYZ]');
  });

  it('removes generic bracketed placeholders like [Date]', () => {
    const out = buildComplaintLetter({ ...full, body: 'Reported on [Date] for action.' });
    expect(out).not.toContain('[Date]');
    expect(out).toContain('Reported on');
  });

  it('always opens with the formal envelope header', () => {
    const out = buildComplaintLetter(full);
    expect(out.startsWith('To,')).toBe(true);
    expect(out).toContain('The Concerned Officer,');
    expect(out).toContain('Respected Sir/Madam,');
  });
});
