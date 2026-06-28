const WEBHOOKS = {
  issue_intelligence: import.meta.env.VITE_N8N_ISSUE_WEBHOOK,
  social_post:        import.meta.env.VITE_N8N_SOCIAL_WEBHOOK,
  authority_email:    import.meta.env.VITE_N8N_AUTH_WEBHOOK,
  escalation:         import.meta.env.VITE_N8N_ESCALATE_WEBHOOK,
};

export const triggerN8N = async (workflowName, payload) => {
  const url = WEBHOOKS[workflowName];
  if (!url || url === 'undefined' || url === '') {
    return null;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error(`[n8n] Webhook failed: ${workflowName}`, err.message);
    return null;
  }
};
