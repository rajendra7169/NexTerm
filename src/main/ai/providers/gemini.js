// Google Gemini free-tier provider — 1500 req/day, no credit card.
// https://aistudio.google.com/app/apikey

export async function complete({ prompt, system, model = 'gemini-2.0-flash', apiKey }) {
  if (!apiKey) throw new Error('Gemini API key not configured')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`Gemini ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  const data = await r.json()
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  return text.trim()
}

export async function testConnection({ apiKey }) {
  if (!apiKey) return { ok: false, error: 'No API key provided' }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (r.ok) return { ok: true }
    return { ok: false, error: `${r.status} ${r.statusText}` }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
