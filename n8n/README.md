# JanaShakti — n8n Automation Workflows

JanaShakti offloads its notification/automation side-effects to **n8n Cloud**. The app
never blocks on these: `triggerN8N(name, payload)` in
[`src/utils/n8n.js`](../src/utils/n8n.js) POSTs a JSON payload to a webhook and is
**fire-and-forget + try/catch-wrapped**, so a webhook being down, slow, or misconfigured
never affects the user flow.

```
App event ──triggerN8N(name, payload)──► n8n Webhook ──► Code node ──► Gmail (+ IF branches)
```

Each workflow name maps to a `VITE_N8N_*` webhook URL in `.env`:

| Workflow | Webhook path | `.env` var | `triggerN8N` name | Fires when |
|---|---|---|---|---|
| Issue Intelligence | `janashakti-issue` | `VITE_N8N_ISSUE_WEBHOOK` | `issue_intelligence` | every new issue report |
| Authority Email | `janashakti-authority` | `VITE_N8N_AUTH_WEBHOOK` | `authority_email` | Agent 3 routes an issue to a department |
| Social Post | `janashakti-social` | `VITE_N8N_SOCIAL_WEBHOOK` | `social_post` | Critical severity / confirmations cross the threshold |
| Escalation | `escalation` | `VITE_N8N_ESCALATE_WEBHOOK` | `escalation` | an issue ages past an escalation tier |

All four send mail via the same **Gmail OAuth2** credential.

---

## The workflows

### 1. Issue Intelligence — `janashakti-issue`
Emails an HTML summary of each new report to the ops inbox.
**Flow:** Webhook → *Format Email* (Code, builds the HTML) → *Send Email* (Gmail) →
*Respond to Webhook*.
**Payload** (from `ReportScreen.jsx`): `issueId, complaintId, issueType, severity,
location, description, photoUrl, reporterName, confirmations, issueUrl`.
Note: `photoUrl` is a base64 data URL (or empty) — link to `issueUrl` rather than
embedding it.

### 2. Authority Email — `janashakti-authority`
Sends a formal complaint email to the responsible department.
**Flow:** Webhook → *Generate Formal Email* (Code) → *Send Authority Email* (Gmail) →
*Return Success*.
**Payload** (from `src/agents/authorityRouter.js`): `issueId, departmentName,
emailSubject, issueDetails:{ type, severity, description, location, address, photoUrl,
reporterName, reporterEmail, complaintText, issueUrl }`.
The recipient is set inside the workflow (no email is sent in the payload).

### 3. Social Post — `janashakti-social`
Builds the post text and emails a notification. Honors consent
(`issue.socialConsent`): `none` → skip, `anonymous` → no handle, `tag` → mention the
user's `@handle`.
**Flow:** Webhook → *Build Tweet & Email* (Code) → *Check Social Consent* (IF) →
*Send Email Notification* (Gmail).
**Payload** (from `ReportScreen.jsx` / `IssueDetail.jsx`): `issueId, issueType, severity,
location, description, photoUrl, confirmations, socialConsent, userXHandle`.

### 4. Escalation — `escalation`
Emails an escalation notice when an issue moves up a tier; at the top tier
(`daysOpen >= 30`, level ≥ 3) it also fires a media alert.
**Flow:** Webhook → *Build Escalation Email* (Code) → *Send Escalation Email* (Gmail) →
*Check Media Alert Level* (IF) → *Send Media Alert* (Gmail).
**Payload** (from `src/utils/escalation.js`): `issueId, complaintId, issueType, severity,
location, escalationLevel, previousLevel, escalatedTo, confirmations, daysOpen` (plus
`from`/`to` aliases).

---

## Setup (per workflow, in n8n Cloud)

1. **Import / open** the workflow in n8n.
2. **Select the Gmail credential** — each Gmail node uses an OAuth2 credential
   (*Gmail OAuth2 API*); pick yours after import.
3. **Set the recipient address(es)** in the Gmail node(s) — these are configured in n8n,
   not sent by the app. (Use your real ops / authority / escalation inboxes.)
4. **Activate** the workflow (toggle top-right). The webhook path is fixed (see the table
   above), so the Production URL stays `https://<your-instance>.app.n8n.cloud/webhook/<path>`.
5. Make sure the matching `VITE_N8N_*_WEBHOOK` in `.env` points at that URL, then restart
   the dev server.

A webhook path can only be **active on one workflow at a time** — if you re-import a
workflow, deactivate the old copy first.

---

## Notes

- **Resilience:** every `triggerN8N` call is fire-and-forget and try/catch-wrapped, so a
  webhook outage never breaks the app. Leaving a `VITE_N8N_*_WEBHOOK` blank simply skips
  that automation.
- **CORS:** webhook nodes allow all origins (`*`) for the demo — tighten to your app's
  domain for production.
- **Payload size:** photos are compressed client-side (~640px) before sending, so vision
  payloads stay well under n8n's limits. Large photos are sent as an empty `photoUrl`.

## Optional: AI proxy (removed)

There was a 5th, optional workflow — an **AI proxy** (`janashakti-ai`) that routed Gemini
calls through n8n to keep the API key server-side. The app currently calls **Gemini
directly** (`VITE_N8N_AI_WEBHOOK` unset), so the proxy template was removed from the repo.
It is recoverable from git history, and the client-side plumbing
([`src/utils/aiProxy.js`](../src/utils/aiProxy.js) + the proxy branch in
[`src/utils/gemini.js`](../src/utils/gemini.js)) is still in place if you ever want to
enable it: set `VITE_N8N_AI_WEBHOOK` and have the workflow return `{ "text": "..." }`.
