// Ollama local provider — talks to the daemon at localhost:11434.

import { OLLAMA_BASE } from '../ollama-manager.js'

export async function complete({ prompt, system, model = 'qwen2.5-coder:7b' }) {
  // keep_alive=30m keeps the model loaded in RAM/VRAM between calls so the
  // second / third request is fast. Without this each call cold-starts.
  // num_predict capped at 256 to keep latency predictable.
  // Explicit AbortSignal so the fetch can't hang forever if Ollama wedges.
  const r = await fetch(OLLAMA_BASE + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system: system || undefined,
      stream:     false,
      keep_alive: '30m',
      options:    { temperature: 0.2, num_predict: 256 }
    }),
    signal: AbortSignal.timeout(45_000)
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`Ollama ${r.status}: ${body.slice(0, 300)}`)
  }
  const data = await r.json()
  return (data.response || '').trim()
}

// Streaming variant — yields each token as Ollama produces it (NDJSON over fetch).
export async function* streamComplete({ prompt, system, model = 'qwen2.5-coder:7b', signal }) {
  const r = await fetch(OLLAMA_BASE + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system: system || undefined,
      stream: true,
      keep_alive: '30m',
      options: { temperature: 0.2, num_predict: 1024 }
    }),
    signal
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`Ollama ${r.status}: ${body.slice(0, 300)}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        const obj = JSON.parse(line)
        if (obj.response) yield obj.response
        if (obj.done) return
      } catch {}
    }
  }
}

export async function testConnection() {
  try {
    const r = await fetch(OLLAMA_BASE + '/api/tags', { signal: AbortSignal.timeout(2500) })
    return { ok: r.ok }
  } catch (e) {
    return { ok: false, error: 'Ollama daemon not reachable on localhost:11434' }
  }
}
