import { useEffect, useState } from 'react'
import { useStore } from '../store'

// Strip likely-secret patterns from text before sending to a cloud provider.
function redactSecrets(s) {
  if (!s) return s
  return s
    .replace(/(API[_-]?KEY\s*=\s*)["']?[A-Za-z0-9_\-]{12,}["']?/gi, '$1<redacted>')
    .replace(/(TOKEN\s*=\s*)["']?[A-Za-z0-9_\-]{12,}["']?/gi,        '$1<redacted>')
    .replace(/(SECRET\s*=\s*)["']?[A-Za-z0-9_\-]{12,}["']?/gi,       '$1<redacted>')
    .replace(/(password\s*[:=]\s*)["']?\S+["']?/gi,                  '$1<redacted>')
    .replace(/sk-[A-Za-z0-9]{20,}/g,                                  '<redacted>')
    .replace(/gsk_[A-Za-z0-9]{20,}/g,                                 '<redacted>')
    .replace(/ghp_[A-Za-z0-9]{20,}/g,                                 '<redacted>')
}

export default function AiExplain({ context, onClose, onRunCommand }) {
  const settings = useStore(s => s.settings)
  const ai       = settings.ai || {}
  const enabled  = ai.enabled === true

  const [busy,   setBusy]   = useState(true)
  const [result, setResult] = useState(null)
  const [error,  setError]  = useState(null)

  // Three modes: bundled (built-in node-llama-cpp), local (Ollama daemon),
  // cloud (groq/openai/etc). Earlier this only had local/cloud branches, so
  // bundled silently fell through to cloud and called groq.
  const mode     = ai.mode || 'bundled'
  const provider = mode === 'bundled' ? 'bundled'
                : mode === 'local'    ? 'ollama'
                                      : (ai.cloud?.provider || 'groq')
  const model    = mode === 'bundled' ? (ai.bundled?.model || '')
                : mode === 'local'    ? (ai.local?.model || 'qwen2.5-coder:7b')
                                      : (ai.cloud?.model || 'llama-3.3-70b-versatile')

  useEffect(() => {
    let cancelled = false
    // Hard timeout so the UI never gets stuck on "analyzing…".
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      setError('AI request timed out after 90 seconds. Open DevTools (Ctrl+Shift+I) → Console to see what happened, or switch to a cloud provider for faster results.')
      setBusy(false)
    }, 90_000)

    ;(async () => {
      if (!enabled) {
        setError('AI is disabled. Open Settings → AI to enable it.')
        setBusy(false); clearTimeout(timeoutId); return
      }
      try {
        let apiKey = null
        if (mode === 'cloud') {
          apiKey = await window.nexterm.vault.get(`ai.${provider}.apiKey`)
          if (!apiKey) {
            setError(`No API key set for ${provider}. Open Settings → AI and add a free API key.`)
            setBusy(false); clearTimeout(timeoutId); return
          }
        } else if (mode === 'bundled') {
          if (!model) {
            setError('No built-in model selected. Open Settings → AI and pick one.')
            setBusy(false); clearTimeout(timeoutId); return
          }
        } else {
          // Ollama mode — pre-flight checks so user gets clear feedback instead of a silent stall
          let running = await window.nexterm.ai.isOllamaRunning()
          if (!running) {
            const sr = await window.nexterm.ai.startOllama()
            if (!sr?.ok) {
              setError('Could not start Ollama daemon. Open Settings → AI to check.')
              setBusy(false); clearTimeout(timeoutId); return
            }
          }
          const localModels = await window.nexterm.ai.listLocalModels()
          const hasModel = (localModels || []).some(m =>
            m.name === model || m.name.startsWith(model + ':') || model.startsWith(m.name)
          )
          if (!hasModel) {
            setError(
              `Model "${model}" is not downloaded yet. Open Settings → AI → Local → click ⬇ Pull model to download it (one-time, ~4.7 GB for the 7b coder model).`
            )
            setBusy(false); clearTimeout(timeoutId); return
          }
        }
        const priv = ai.privacy || {}
        let safeOutput = priv.redactEnvVars !== false
          ? redactSecrets(context.output || '')
          : (context.output || '')

        // Aggressively trim the output: last 15 lines, each at most 200 chars,
        // total cap 1500 chars. Long npm/yarn error dumps were stalling the
        // model. The fix is almost always in the last few lines anyway.
        const tailLines = safeOutput.split('\n').slice(-15)
          .map(l => l.length > 200 ? l.slice(0, 200) + '…' : l)
        safeOutput = tailLines.join('\n')
        if (safeOutput.length > 1500) safeOutput = safeOutput.slice(-1500)

        const lastCmd = priv.sendLastCommand !== false ? (context.command || '(unknown)') : '(redacted)'
        const cwdLine = priv.sendCwd !== false && context.cwd ? `cwd: ${context.cwd}\n` : ''

        const prompt = `${cwdLine}Last command: ${lastCmd}

Last output:
${safeOutput}

Briefly explain the failure (1-2 sentences), then on a new line write "Fix: <ONE powershell command>".`

        const system = `Windows PowerShell error helper. Be terse. Reply with a short explanation then a "Fix:" line with one command. No markdown fences.`

        console.log('[AiExplain] sending request', {
          provider, model, promptLen: prompt.length, systemLen: system.length
        })
        const t0 = Date.now()
        const r = await window.nexterm.ai.complete({ provider, model, apiKey, prompt, system })
        console.log(`[AiExplain] response in ${Date.now() - t0}ms`, r)
        if (cancelled) return
        if (!r?.ok) {
          setError(r?.error || 'AI request failed (no error message returned)')
        } else if (!r.text || !r.text.trim()) {
          setError(`The model returned an empty response. The prompt may have been too long for ${model}, or the model needs to finish loading. Try again.`)
        } else {
          setResult(r.text)
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e))
      }
      clearTimeout(timeoutId)
      if (!cancelled) setBusy(false)
    })()

    return () => { cancelled = true; clearTimeout(timeoutId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Extract the "Fix: <cmd>" line so we can run it with one click.
  const fixCommand = result && (() => {
    const m = result.match(/^\s*Fix:\s*(.+?)\s*$/m)
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null
  })()

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette ai-bar" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div className="ai-bar-header">
          <span className="ai-bar-icon">✨</span>
          <span>Explain & Fix</span>
          <span className="ai-bar-meta">{
            mode === 'cloud'   ? `${provider} · ${model}` :
            mode === 'bundled' ? `built-in · ${model || 'no model'}` :
                                 `ollama · ${model}`
          }</span>
        </div>

        <div className="ai-bar-scroll">
          {busy && (
            <div className="ai-bar-status">
              <span className="ai-bar-spinner" />
              <span>
                analyzing with <strong>{mode === 'cloud' ? provider : mode === 'bundled' ? 'Built-in' : 'Ollama'}</strong>
                {' '}({model})…
                {mode === 'local' && <span style={{ opacity: 0.6 }}> {' '}— first call on a freshly-loaded model can take 10-30s</span>}
              </span>
            </div>
          )}
          {error && <div className="ai-bar-error">⚠ {error}</div>}
          {result && (
            <>
              <pre className="ai-bar-result">{result}</pre>
              <div className="ai-bar-actions">
                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(result)}>Copy</button>
                {fixCommand && (
                  <button className="btn-primary" onClick={() => { onRunCommand(fixCommand); onClose() }}>Run fix</button>
                )}
                <button className="btn-secondary" onClick={onClose}>Close</button>
              </div>
            </>
          )}
          {!enabled && !busy && !error && (
            <div className="ai-bar-hint">AI is disabled — open <strong>Settings → AI</strong> to enable.</div>
          )}
          {!busy && !error && !result && enabled && (
            <div className="ai-bar-error">
              ⚠ The request finished but no content arrived. Check Settings → AI to confirm your provider/model is configured, then try again.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
