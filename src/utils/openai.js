// OpenAI (GPT) client — mirrors the Gemini util's interface.
// Accepts the same Gemini-style "parts" array so the two providers are
// interchangeable behind fetchAI() in gemini.js.
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const MODEL = 'gpt-4o-mini';
const URL = 'https://api.openai.com/v1/chat/completions';

export const getOpenAIModel = () => MODEL;

// parts: [{ text }, { inline_data: { mime_type, data } }]  → OpenAI content array
const toContent = (parts) =>
  parts
    .map((p) => {
      if (p.text) return { type: 'text', text: p.text };
      if (p.inline_data) {
        return {
          type: 'image_url',
          image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` },
        };
      }
      return null;
    })
    .filter(Boolean);

// Returns cleaned raw text (JSON fences stripped). Caller does JSON.parse if needed.
export const fetchOpenAI = async (parts) => {
  if (!API_KEY) throw new Error('VITE_OPENAI_API_KEY is missing in .env');

  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: toContent(parts) }],
      temperature: 0.1,
    }),
  });

  if (res.status === 429) throw new Error('OpenAI rate limited (429)');
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI');

  return text.replace(/```json|```/g, '').trim();
};
