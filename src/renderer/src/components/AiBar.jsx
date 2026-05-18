import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// Read API key for the active cloud provider from our encrypted vault.
async function getApiKey(provider) {
  try {
    return await window.nexterm.vault.get(`ai.${provider}.apiKey`)
  } catch { return null }
}

export default function AiBar({ onClose }) {
  const settings    = useStore(s => s.settings)
  const tabs        = useStore(s => s.tabs)
  const activeId    = useStore(s => s.activeId)
  const cwds        = useStore(s => s.cwds)

  const [prompt, setPrompt]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState(null)   // suggested command(s)
  const [error,  setError]    = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30) }, [])

  const ai = settings.ai || {}
  const enabled = ai.enabled === true
  // Three modes: bundled (built-in), local (Ollama), cloud (groq/openai/etc).
  const mode    = ai.mode    || 'bundled'
  const provider = mode === 'bundled' ? 'bundled'
                : mode === 'local'    ? 'ollama'
                                      : (ai.cloud?.provider || 'groq')
  const model    = mode === 'bundled' ? (ai.bundled?.model || '')
                : mode === 'local'    ? (ai.local?.model || 'qwen2.5-coder:7b')
                                      : (ai.cloud?.model || 'llama-3.3-70b-versatile')

  async function submit() {
    if (!prompt.trim()) return
    if (!enabled) {
      setError('AI is disabled. Open Settings → AI to enable it.')
      return
    }
    setError(null); setResult(null); setBusy(true)
    try {
      let apiKey = null
      if (mode === 'cloud') {
        apiKey = await getApiKey(provider)
        if (!apiKey) {
          setError(`No API key set for ${provider}. Open Settings → AI to add one.`)
          setBusy(false)
          return
        }
      } else if (mode === 'bundled') {
        if (!model) {
          setError('No built-in model selected. Open Settings → AI and pick one.')
          setBusy(false); return
        }
      } else {
        let running = await window.nexterm.ai.isOllamaRunning()
        if (!running) {
          const sr = await window.nexterm.ai.startOllama()
          if (!sr?.ok) {
            setError('Could not start Ollama daemon. Open Settings → AI to check.')
            setBusy(false); return
          }
        }
        const localModels = await window.nexterm.ai.listLocalModels()
        const hasModel = (localModels || []).some(m =>
          m.name === model || m.name.startsWith(model + ':') || model.startsWith(m.name)
        )
        if (!hasModel) {
          setError(`Model "${model}" is not downloaded yet. Open Settings → AI → Local → click ⬇ Pull model.`)
          setBusy(false); return
        }
      }
      // Include light context honoring privacy settings
      const priv = ai.privacy || {}
      const tab    = tabs.find(t => t.id === activeId)
      const paneId = tab?.activePane
      let   cwd    = (paneId && cwds[paneId]) || ''
      if (priv.redactHomePath && cwd) {
        const home = (await window.nexterm.app.initialCwd?.()) || ''
        // simple replacement — also recognize USERPROFILE-shaped paths
        cwd = cwd.replace(/^[A-Z]:\\Users\\[^\\]+/i, '~')
      }
      const ctx = [
        priv.sendCwd   !== false && cwd ? `Current directory: ${cwd}` : null,
        priv.sendShell !== false       ? 'Shell: PowerShell (Windows)' : null
      ].filter(Boolean).join('\n')
      const fullPrompt = ctx
        ? `${ctx}\n\nTask: ${prompt}\n\nCommand:`
        : `Task: ${prompt}\n\nCommand:`

      const r = await window.nexterm.ai.complete({
        provider, model, apiKey,
        prompt: fullPrompt
      })
      if (!r?.ok) {
        setError(r?.error || 'AI request failed (no error message returned)')
      } else if (!r.text || !r.text.trim()) {
        setError(`The model returned an empty response. Try again or pick a different model.`)
      } else {
        // Strip code fences / leading "PS>" / leading "$" if model still added them
        let text = r.text || ''
        text = text.replace(/^```[\w]*\n?|\n?```$/g, '').trim()
        text = text.replace(/^(PS\s+[^>]*>|\$)\s*/gm, '').trim()
        setResult(text)
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function insert() {
    if (!result) return
    const tab    = tabs.find(t => t.id === activeId)
    const paneId = tab?.activePane
    if (!paneId) return
    window.nexterm.pty.write(paneId, result)
    onClose()
  }

  function run() {
    if (!result) return
    const tab    = tabs.find(t => t.id === activeId)
    const paneId = tab?.activePane
    if (!paneId) return
    window.nexterm.pty.write(paneId, result + '\r')
    onClose()
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette ai-bar" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="ai-bar-header">
          <span className="ai-bar-icon">✨</span>
          <span>AI Command</span>
          <span className="ai-bar-meta">
            {mode === 'cloud' ? `${provider} · ${model}` : `local · ${model}`}
          </span>
        </div>
        <div className="ai-bar-input-row">
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Describe what you want to do…  (e.g. 'find all .log files modified today')"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              if (e.key === 'Escape') onClose()
            }}
            disabled={busy}
          />
          <button
            className="btn-primary"
            onClick={submit}
            disabled={busy || !prompt.trim()}
            style={{ flex: '0 0 auto' }}
          >
            {busy ? '…' : '↵ Ask'}
          </button>
        </div>

        <div className="ai-bar-scroll">
          {busy && (
            <div className="ai-bar-status">
              <span className="ai-bar-spinner" />
              <span>
                thinking with <strong>{mode === 'cloud' ? provider : 'Ollama'}</strong> ({model})…
                {mode === 'local' && <span style={{ opacity: 0.6 }}> — first call on a fresh model can take 10-30s</span>}
              </span>
            </div>
          )}

          {error && (
            <div className="ai-bar-error">⚠ {error}</div>
          )}

          {result && (
            <>
              <pre className="ai-bar-result">{result}</pre>
              <div className="ai-bar-actions">
                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(result)}>Copy</button>
                <button className="btn-secondary" onClick={insert}>Insert</button>
                <button className="btn-primary"   onClick={run}>Run</button>
              </div>
            </>
          )}

          {!enabled && !error && (
            <div className="ai-bar-hint">
              AI is currently disabled. Open <strong>Settings → AI</strong> to set up Ollama (local) or paste a free Groq API key.
            </div>
          )}

          {!busy && !error && !result && enabled && (
            <div className="ai-bar-hint">
              <div style={{ marginBottom: 8 }}>Try one of these:</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                <li><code>find all .log files modified today</code></li>
                <li><code>kill the process using port 3000</code></li>
                <li><code>create a package.json for a typescript node project</code></li>
                <li><code>git: undo my last commit but keep the changes</code></li>
              </ul>
              <div style={{ marginTop: 8, fontSize: 10, opacity: 0.5 }}>
                Provider: {mode === 'cloud' ? `${provider} cloud` : 'Ollama local'} · model: <code>{model}</code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
