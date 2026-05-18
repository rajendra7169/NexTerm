// Anthropic (Claude) cloud provider — direct API.
//
// Two auth modes are supported by the renderer:
//   - 'api'   → user pastes an Anthropic API key (pay per token)
//   - 'cli'   → user has Claude Code installed and logged in via their
//               Claude Pro subscription (no API key needed). For 'cli'
//               mode we don't hit api.anthropic.com directly — instead
//               we shell out to the `claude` binary. That branch lives
//               in a separate module (anthropic-cli.js) because it
//               needs subprocess management and a different streaming
//               protocol.
//
// This file only handles the API-key path. The router picks which one
// to call based on settings.extensionConfig['anthropic.claude'].authMode.
//
// Anthropic's Messages API uses a different shape than OpenAI's chat
// completions: separate `system` field, different streaming events.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

function buildUserContent(prompt, images) {
  if (!images || images.length === 0) return prompt
  // Anthropic's content blocks: text + image (base64).
  return [
    ...images.map(img => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mime || 'image/png',
        data: img.dataBase64
      }
    })),
    { type: 'text', text: prompt }
  ]
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export async function complete({ prompt, system, images, model = DEFAULT_MODEL, apiKey }) {
  if (!apiKey) throw new Error('Anthropic API key not configured')
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: buildUserContent(prompt, images) }]
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`Anthropic ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  const data = await r.json()
  return (data.content?.[0]?.text || '').trim()
}

export async function* streamComplete({ prompt, system, images, model = DEFAULT_MODEL, apiKey, signal }) {
  if (!apiKey) throw new Error('Anthropic API key not configured')
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: buildUserContent(prompt, images) }]
    }),
    signal
  })
  if (!r.ok) {
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    throw new Error(`Anthropic ${r.status}: ${String(detail).slice(0, 300)}`)
  }
  // Parse Anthropic's SSE stream — events of interest:
  //   content_block_delta { delta: { type: 'text_delta', text } }
  //   message_stop
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
      if (!dataLine) continue
      const payload = dataLine.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const evt = JSON.parse(payload)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield evt.delta.text
        }
      } catch {}
    }
  }
}

export async function testConnection({ apiKey }) {
  if (!apiKey) return { ok: false, error: 'No API key provided' }
  try {
    // Minimal request — 1 token output to confirm the key is valid.
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (r.ok) return { ok: true }
    let detail = await r.text()
    try { detail = JSON.parse(detail).error?.message || detail } catch {}
    return { ok: false, error: `${r.status}: ${String(detail).slice(0, 200)}` }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
