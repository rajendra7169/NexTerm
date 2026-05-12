// Shared helper: parse an OpenAI-compatible SSE stream and yield content deltas.
// Used by Groq, Cerebras, OpenRouter — all expose /chat/completions with stream=true.

export async function* streamOpenAICompat({ url, headers, body, signal }) {
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`${url.replace(/.*\/\/([^/]+).*/, '$1')} ${r.status}: ${text.slice(0, 300)}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // Each SSE event ends with a blank line; split on \n and parse "data:" lines.
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const obj = JSON.parse(payload)
        const delta = obj.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {}
    }
  }
}
