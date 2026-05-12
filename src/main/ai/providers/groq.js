// Groq free-tier cloud provider — OpenAI-compatible API at api.groq.com.

export async function complete({ prompt, system, model = 'llama-3.3-70b-versatile', apiKey }) {
  if (!apiKey) throw new Error('Groq API key not configured')
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens:  512
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`Groq ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  const data = await r.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

export async function testConnection({ apiKey }) {
  if (!apiKey) return { ok: false, error: 'No API key provided' }
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    })
    if (r.ok) return { ok: true }
    return { ok: false, error: `${r.status} ${r.statusText}` }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
