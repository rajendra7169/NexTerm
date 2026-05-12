// Pulls an Ollama model with live progress.
// Ollama's /api/pull streams newline-delimited JSON objects:
//   { status: 'downloading', completed: 12345, total: 67890, digest: '...' }
//   { status: 'verifying sha256 digest' }
//   { status: 'success' }

import { OLLAMA_BASE } from './ollama-manager.js'

export async function pullModel(modelName, onProgress) {
  if (!modelName) throw new Error('No model name')
  const res = await fetch(OLLAMA_BASE + '/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama pull ${res.status}: ${body.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
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
        const update = JSON.parse(line)
        onProgress?.({
          status:    update.status || '',
          completed: update.completed || 0,
          total:     update.total || 0,
          percent:   update.total ? ((update.completed || 0) / update.total) * 100 : 0,
          digest:    update.digest
        })
      } catch {}
    }
  }
}

export async function deleteModel(modelName) {
  const res = await fetch(OLLAMA_BASE + '/api/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName })
  })
  return res.ok
}
