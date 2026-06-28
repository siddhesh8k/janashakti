// AI proxy client — routes model calls through an n8n webhook so the Gemini API
// key lives on the server (in n8n), NOT in the shipped client bundle.
//
// Enabled only when VITE_N8N_AI_WEBHOOK is set. Otherwise the app falls back to
// calling the provider directly (see fetchAI in gemini.js).
const AI_WEBHOOK = import.meta.env.VITE_N8N_AI_WEBHOOK;

export const isProxyEnabled = () => !!AI_WEBHOOK && AI_WEBHOOK !== '';

// parts: Gemini-style [{ text }, { inline_data: { mime_type, data } }]
// Returns cleaned raw text (JSON fences stripped); caller does JSON.parse if needed.
export const fetchViaProxy = async (parts) => {
  const res = await fetch(AI_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini', parts }),
  });

  if (!res.ok) throw new Error(`AI proxy HTTP ${res.status}`);

  const data = await res.json();
  // Tolerate a few shapes n8n may return: {text}, {output}, [{text}], or raw string
  const text =
    data?.text ??
    data?.output ??
    (Array.isArray(data) ? data[0]?.text ?? data[0]?.json?.text : null) ??
    (typeof data === 'string' ? data : null);

  if (!text) throw new Error('Empty response from AI proxy');
  return String(text).replace(/```json|```/g, '').trim();
};
