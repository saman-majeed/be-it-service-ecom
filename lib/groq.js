/**
 * Groq API client (OpenAI-compatible). Used for chatbot and inventory AI insights.
 */
async function groqChat(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in .env');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens ?? 1800,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || response.statusText;
    throw new Error(`Groq API error: ${msg}`);
  }

  return data.choices?.[0]?.message?.content?.trim() || '';
}

module.exports = { groqChat };
