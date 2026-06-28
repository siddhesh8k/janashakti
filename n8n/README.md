# JanaShakti AI Proxy (n8n)

Routes all model calls through n8n so the **Gemini key lives on the server, not
in the client bundle**. The browser only ever talks to your n8n webhook.

```
Browser (fetchAI) ──POST {parts}──► n8n Webhook ──► Code node (has the key) ──► Gemini ──► { text } ──► Browser
```

## 1. Import the workflow

1. Open n8n Cloud → **Workflows → Import from File**.
2. Choose [`janashakti-ai-proxy.json`](./janashakti-ai-proxy.json).

It has two nodes: **Webhook** → **Call AI Provider** (a Code node).

## 2. Set your key (server-side)

The **Call AI Provider** code node reads the key from an n8n environment variable —
it is **never** committed to source or shipped to the browser. Set it in n8n:

- `JANASHAKTI_GEMINI_KEY` — your Google AI Studio key

Add it as an n8n **environment variable** (read in the node via `$env.JANASHAKTI_GEMINI_KEY`).
If your n8n plan exposes **Variables** instead, swap `$env.` for `$vars.` in the node.

## 3. Activate the workflow

1. Toggle the workflow **Active** (top-right). It uses the fixed path `janashakti-ai`,
   so the Production URL is:
   `https://siddheshkadam08.app.n8n.cloud/webhook/janashakti-ai`

## 4. Point the app at it

In `janashakti/.env`:

```
VITE_N8N_AI_WEBHOOK=https://<your-instance>.app.n8n.cloud/webhook/janashakti-ai
```

Restart the dev server. That's it — every AI call (issue analysis, complaint
text, routing, prediction, RTI, captions, insights) now goes through n8n.

## How the switch works

`fetchAI()` in [`src/utils/gemini.js`](../src/utils/gemini.js) picks, in order:

1. **n8n proxy** — if `VITE_N8N_AI_WEBHOOK` is set (key server-side ✅)
2. **Direct Gemini** — otherwise

So leaving `VITE_N8N_AI_WEBHOOK` blank keeps the old direct-call behavior; the
app never breaks if the proxy is down — just remove/clear the var to fall back.

## Notes

- **CORS:** the Webhook node already sets *Allowed Origins* to `*`. Tighten it to
  your app's domain for production.
- **Payload size:** photos are compressed client-side (~640px) before sending, so
  vision requests stay well under n8n's payload limit.
- **Once this is live, rotate the key that was previously in the client bundle.**
- The client no longer needs `VITE_GEMINI_API_KEY` once the proxy is in use —
  you can remove it from `.env` (and from the deployed build) entirely.
