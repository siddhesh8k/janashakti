import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { DEPARTMENT_MAP } from '../constants/departments';
import { logAgent } from '../utils/gemini';
import { triggerN8N } from '../utils/n8n';
import { runReActLoop } from './reactLoop';

// ── Agent 3: Authority Router ────────────────────────────────────────────────────
// Was a single Gemini call; now a bounded ReAct loop. The agent grounds its choice in
// real tools before committing: it looks the issue type up in the official department
// catalog and checks how similar past reports were routed (and how many got resolved),
// then finalizes the department/officer/SLA and notifies the authority. Returns the same
// routing shape every caller already expects, plus a `trace` of its reasoning.

const ROUTER_FN = {
  name: 'router_step',
  description: 'Choose the next step to route this civic issue to the correct government authority.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        enum: ['lookup_department', 'check_prior_routings', 'finalize_routing'],
        description: 'the single next step',
      },
      reasoning: { type: 'STRING', description: 'one sentence: why this step' },
      // finalize_routing args (ignored for the grounding actions)
      departmentName: { type: 'STRING', description: 'full official department name' },
      departmentCode: { type: 'STRING' },
      wardOffice: { type: 'STRING' },
      officerTitle: { type: 'STRING', description: 'officer to address, e.g. Executive Engineer' },
      emailSubject: { type: 'STRING', description: 'formal email subject line' },
      urgencyLevel: { type: 'STRING', enum: ['Routine', 'Urgent', 'Emergency'] },
      slaHours: { type: 'NUMBER' },
      escalationPath: { type: 'STRING' },
    },
    required: ['action', 'reasoning'],
  },
};

const ACTION_LABEL = {
  lookup_department: 'Look up department',
  check_prior_routings: 'Check prior routings',
  finalize_routing: 'Finalize & notify authority',
};

// n8n authority email — its own try/catch so a webhook hiccup never loses the routing.
const sendAuthorityEmail = async (issue, issueId, routing) => {
  const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
  try {
    await triggerN8N('authority_email', {
      issueId,
      departmentName: routing.departmentName,
      emailSubject: routing.emailSubject,
      issueDetails: {
        type: issue.issueType,
        severity: issue.severity,
        description: issue.description,
        location: issue.locationText,
        address: issue.locationText,
        photoUrl: issue.photoUrl,
        reporterName: issue.userName,
        reporterEmail: issue.userEmail || '',
        complaintText: issue.complaintText || '',
        issueUrl: `${origin}/issue/${issueId}`,
        recurrence: issue.recurrenceOf ? {
          priorComplaintId: issue.recurrenceOfComplaintId || null,
          resolvedAt: issue.recurrenceResolvedAt || null,
          daysSinceResolved: issue.recurrenceDaysSince ?? null,
          count: issue.recurrenceCount ?? 1,
        } : null,
      },
    });
    return true;
  } catch (e) {
    console.error('[authorityRouter/n8n]:', e.message);
    return false;
  }
};

// Assemble the final routing object from the model's args, defaulting any gap to the
// canonical catalog entry, then notify the authority.
const finalizeRouting = async (issue, issueId, args, ctx) => {
  const canonical = ctx.canonical || DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;
  const routing = {
    departmentName: args?.departmentName || canonical.name,
    departmentCode: args?.departmentCode || canonical.code,
    wardOffice: args?.wardOffice || '',
    officerTitle: args?.officerTitle || '',
    emailSubject: args?.emailSubject || `Civic complaint: ${issue.issueType} (${issue.severity}) — ${issue.city || 'India'}`,
    urgencyLevel: args?.urgencyLevel || 'Routine',
    slaHours: typeof args?.slaHours === 'number' ? args.slaHours : canonical.slaHours,
    escalationPath: args?.escalationPath || 'ward office to department head to commissioner',
  };
  const emailSent = await sendAuthorityEmail(issue, issueId, routing);
  routing.emailSent = emailSent;
  routing.emailSentAt = emailSent ? new Date().toISOString() : null;
  return routing;
};

export const routeToAuthority = async (issue, issueId) => {
  const startTime = Date.now();
  const ctx = { canonical: null, priors: null };

  const buildPrompt = (history, c, meta) => {
    const recurrenceNote = issue.recurrenceOf
      ? `\n- RECURRENCE: previously resolved ${issue.recurrenceDaysSince ?? '?'}d ago (${issue.recurrenceOfComplaintId || 'on record'}) but it came back — the earlier fix failed; treat with higher urgency.`
      : '';
    let p = `You are the Authority Router for JanaShakti, India's civic accountability platform.
Route this issue to the correct government department, then notify them.

ISSUE
- Type: ${issue.issueType} · Severity: ${issue.severity}
- City: ${issue.city || 'Not specified'} · Ward: ${issue.ward || 'Not specified'}
- Description: ${issue.description || '—'}${recurrenceNote}

ACTIONS
- lookup_department: get the canonical department + SLA for this issue type from the official catalog.
- check_prior_routings: see which department similar past reports went to and how many were resolved.
- finalize_routing: commit department, officer, email subject, urgency and SLA, and notify the authority. Provide ALL those fields.

RULES
- Ground your choice with lookup_department and/or check_prior_routings, THEN finalize_routing.
- Never repeat a step already performed this run.`;
    if (history.length) {
      p += `\n\nOBSERVED SO FAR:\n` + history.map((h, i) => `${i + 1}. ${h.action} → ${h.observation}`).join('\n');
    }
    if (meta.isLast) p += `\n\nThis is your LAST step — choose finalize_routing now with your best department.`;
    return p;
  };

  const runTool = async (action, decision, c) => {
    switch (action) {
      case 'lookup_department': {
        const dept = DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;
        c.canonical = dept;
        return { observation: `Catalog: "${issue.issueType}" → ${dept.name} (code ${dept.code}, SLA ${dept.slaHours}h, ${dept.email}).` };
      }
      case 'check_prior_routings': {
        try {
          const snap = await getDocs(
            query(collection(db, 'issues'), where('issueType', '==', issue.issueType), limit(12)),
          );
          const routed = snap.docs.map((d) => d.data()).filter((i) => i.routedTo?.departmentName);
          c.priors = routed;
          if (!routed.length) return { observation: `No prior ${issue.issueType} routings on record yet.` };
          const counts = {};
          let resolved = 0;
          routed.forEach((i) => {
            counts[i.routedTo.departmentName] = (counts[i.routedTo.departmentName] || 0) + 1;
            if (i.status === 'Resolved') resolved += 1;
          });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          return { observation: `${routed.length} prior ${issue.issueType} reports → mostly "${top[0]}" (${top[1]}×); ${resolved}/${routed.length} resolved.` };
        } catch (e) {
          return { observation: `Could not check prior routings: ${e.message}.` };
        }
      }
      case 'finalize_routing': {
        const routing = await finalizeRouting(issue, issueId, decision, c);
        return {
          observation: `Routed to ${routing.departmentName} (${routing.urgencyLevel}, SLA ${routing.slaHours}h)${routing.emailSent ? ' — authority emailed.' : ' — email pending.'}`,
          done: true,
          result: routing,
        };
      }
      default:
        return { observation: `Unknown step "${action}".` };
    }
  };

  try {
    const { trace, result } = await runReActLoop({
      fnDeclaration: ROUTER_FN,
      buildPrompt,
      runTool,
      maxIterations: 3,
      agentKey: 'router',
      agentName: 'Authority Router',
      labelFor: (action) => ACTION_LABEL[action] || 'Authority Router',
      ctx,
    });

    // The model may stop without finalizing — commit a catalog-based routing so the
    // authority is still notified (preserves the old "always routes" behaviour).
    const routing = result || await finalizeRouting(issue, issueId, null, ctx);

    await logAgent({
      issueId, agentName: 'authority_router',
      input: { issueType: issue.issueType, city: issue.city },
      output: routing,
      processingTimeMs: Date.now() - startTime, success: true,
    });
    return { ...routing, trace };
  } catch (err) {
    await logAgent({
      issueId, agentName: 'authority_router',
      input: issue, output: null,
      processingTimeMs: Date.now() - startTime, success: false, error: err.message,
    });
    const fallback = DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;
    return {
      departmentName: fallback.name,
      departmentCode: fallback.code,
      emailSent: false,
      slaHours: fallback.slaHours,
      urgencyLevel: 'Routine',
      trace: [],
    };
  }
};
