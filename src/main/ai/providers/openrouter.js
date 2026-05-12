// OpenRouter — multi-model gateway with several "free" labeled models.
// https://openrouter.ai/keys

import { streamOpenAICompat } from './_openai-sse.js'

function buildUserContent(prompt, images) {
  if (!images || images.length === 0) return prompt
  return [
    { type: 'text', text: prompt },
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.mime || 'image/png'};base64,${img.dataBase64}` }
    }))
  ]
}

export async function* streamComplete({ prompt, system, images, model = 'meta-llama/llama-3.2-3b-instruct:free', apiKey, signal }) {
  if (!apiKey) throw new Error('OpenRouter API key not configured')
  yield* streamOpenAICompat({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://github.com/rajendra7169/NexTerm',
      'X-Title':       'NexTerm'
    },
    body: {
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: buildUserContent(prompt, images) }
      ],
      temperature: 0.2,
      max_tokens:  1024,
      stream: true
    },
    signal
  })
}

export async function complete({ prompt, system, images, model = 'meta-llama/llama-3.2-3b-instruct:free', apiKey }) {
  if (!apiKey) throw new Error('OpenRouter API key not configured')
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://github.com/rajendra7169/NexTerm',
      'X-Title':       'NexTerm'
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: buildUserContent(prompt, images) }
      ],
      temperature: 0.2,
      max_tokens:  512
    }),
    signal: AbortSignal.timeout(45_000)
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`OpenRouter ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  const data = await r.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

export async function testConnection({ apiKey }) {
  if (!apiKey) return { ok: false, error: 'No API key provided' }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    })
    if (r.ok) return { ok: true }
    return { ok: false, error: `${r.status} ${r.statusText}` }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
