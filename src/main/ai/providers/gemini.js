// Google Gemini free-tier provider — 1500 req/day, no credit card.
// https://aistudio.google.com/app/apikey

function buildUserParts(prompt, images) {
  const parts = [{ text: prompt }]
  if (images && images.length > 0) {
    for (const img of images) {
      parts.push({ inline_data: { mime_type: img.mime || 'image/png', data: img.dataBase64 } })
    }
  }
  return parts
}

// Streaming via the alt=sse variant of streamGenerateContent.
export async function* streamComplete({ prompt, system, images, model = 'gemini-2.0-flash', apiKey, signal }) {
  if (!apiKey) throw new Error('Gemini API key not configured')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ role: 'user', parts: buildUserParts(prompt, images) }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!r.ok) {
    let detail = await r.text().catch(() => '')
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`Gemini ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload)
        const text = obj.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
        if (text) yield text
      } catch {}
    }
  }
}

export async function complete({ prompt, system, images, model = 'gemini-2.0-flash', apiKey }) {
  if (!apiKey) throw new Error('Gemini API key not configured')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ role: 'user', parts: buildUserParts(prompt, images) }],
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
