import { useEffect, useState } from 'react'
import { useStore } from '../store'

// Reusable AI setup card. Used both in the first-launch Welcome Wizard and
// from the empty AiChat state when the user tries to chat without setting
// up an AI provider. Three branches:
//   - bundled  (recommended for first users)  → download + activate a model
//   - ollama   (recommended for power users)  → install + pull
//   - cloud    (free APIs)                    → open browser, paste & test key
//
// Each branch has a "Skip for now" option.
export default function AiSetup({ onDone, onSkip, compact = false }) {
  const settings = useStore(s => s.settings)
  const setSettings = useStore(s => s.setSettings)
  const ai = settings.ai || {}

  const [step, setStep] = useState('pick')  // 'pick' | 'bundled' | 'ollama' | 'cloud' | 'done'

  function upd(patch) { setSettings({ ...settings, ai: { ...ai, ...patch } }) }

  if (step === 'pick') {
    return (
      <div className={`aisetup ${compact ? 'aisetup-compact' : ''}`}>
        <div className="aisetup-title">Set up AI</div>
        <div className="aisetup-sub">Pick how NexTerm should run AI. You can change this anytime in Settings.</div>
        <div className="aisetup-cards">
          <div className="aisetup-card recommended" onClick={() => setStep('bundled')}>
            <div className="aisetup-badge">RECOMMENDED</div>
            <div className="aisetup-card-emoji">📦</div>
            <div className="aisetup-card-title">Bundled</div>
            <div className="aisetup-card-desc">
              Runs inside NexTerm. No external dependency. Download a small model once, never break again.
            </div>
            <div className="aisetup-card-meta">≈ 1–4 GB · CPU/GPU · Best for first-time users</div>
          </div>
          <div className="aisetup-card" onClick={() => setStep('ollama')}>
            <div className="aisetup-card-emoji">🦙</div>
            <div className="aisetup-card-title">Ollama</div>
            <div className="aisetup-card-desc">
              Separate Ollama daemon for managing local models. Lots of models, great UI.
            </div>
            <div className="aisetup-card-meta">External app · Power users</div>
          </div>
          <div className="aisetup-card" onClick={() => setStep('cloud')}>
            <div className="aisetup-card-emoji">☁</div>
            <div className="aisetup-card-title">Cloud (free)</div>
            <div className="aisetup-card-desc">
              Use Groq, Gemini, Cerebras, or OpenRouter via free APIs. Fastest, no download.
            </div>
            <div className="aisetup-card-meta">Free tier · Internet required</div>
          </div>
        </div>
        <div className="aisetup-skip">
          <button className="aisetup-link" onClick={() => { onSkip?.(); }}>Skip for now — set up later in Settings</button>
        </div>
      </div>
    )
  }

  if (step === 'bundled') {
    return <BundledSetup
      onBack={() => setStep('pick')}
      onDone={() => { upd({ enabled: true, mode: 'bundled' }); onDone?.() }}
      onSkip={() => { upd({ mode: 'bundled' }); onSkip?.() }}
    />
  }

  if (step === 'ollama') {
    return <OllamaSetup
      onBack={() => setStep('pick')}
      onDone={() => { upd({ enabled: true, mode: 'local' }); onDone?.() }}
      onSkip={() => { upd({ mode: 'local' }); onSkip?.() }}
    />
  }

  if (step === 'cloud') {
    return <CloudSetup
      ai={ai}
      onBack={() => setStep('pick')}
      onDone={(prov) => { upd({ enabled: true, mode: 'cloud', cloud: { ...(ai.cloud || {}), provider: prov } }); onDone?.() }}
      onSkip={() => { upd({ mode: 'cloud' }); onSkip?.() }}
    />
  }

  return null
}

// ── Bundled branch ─────────────────────────────────────────────────────
function BundledSetup({ onBack, onDone, onSkip }) {
  const settings = useStore(s => s.settings)
  const setSettings = useStore(s => s.setSettings)
  const [models, setModels] = useState([])
  const [recommend, setRecommend] = useState(null)
  const [progress, setProgress] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  function refresh() { window.nexterm.ai.bundledList().then(setModels) }
  useEffect(() => {
    refresh()
    window.nexterm.ai.bundledRecommend().then(setRecommend)
    const off = window.nexterm.ai.onBundledProgress?.((p) => {
      setProgress(s => ({ ...s, [p.id]: p }))
    })
    return () => { off?.() }
  }, [])

  const [loading, setLoading] = useState(null)   // id currently being loaded into RAM
  async function download(id) {
    setError(null); setBusy(id)
    const r = await window.nexterm.ai.bundledDownload(id)
    setBusy(null)
    if (r?.cancelled) {
      // Keep .partial visible so user can resume
      refresh()
      return
    }
    setProgress(s => { const x = { ...s }; delete x[id]; return x })
    if (!r?.ok) { setError(r?.error || 'Download failed'); refresh(); return }
    // Auto-activate after first download — show a "loading" state explicitly
    setLoading(id)
    await window.nexterm.ai.bundledLoad(id)
    setLoading(null)
    const ai = settings.ai || {}
    setSettings({ ...settings, ai: { ...ai, bundled: { ...(ai.bundled || {}), model: id } } })
    refresh()
  }
  async function cancel(id) {
    await window.nexterm.ai.bundledCancel(id)
  }
  async function activate(id) {
    setError(null); setLoading(id)
    const r = await window.nexterm.ai.bundledLoad(id)
    setLoading(null)
    if (!r?.ok) { setError(r?.error || 'Load failed'); return }
    const ai = settings.ai || {}
    setSettings({ ...settings, ai: { ...ai, bundled: { ...(ai.bundled || {}), model: id } } })
    refresh()
  }

  function fmt(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB' }
  const recName = models.find(m => m.id === recommend?.recommendedId)?.name

  return (
    <div className="aisetup">
      <div className="aisetup-header">
        <button className="aisetup-back" onClick={onBack}>← Back</button>
        <div className="aisetup-title">Pick a model</div>
      </div>
      {recommend && (
        <div className="aisetup-sub">
          🖥 Detected: <strong>{recommend.ramGB} GB RAM</strong>
          {' · '}<em>{String(recommend.gpu).slice(0, 50)}</em>
          {recName && <> · Recommended: <strong>{recName}</strong></>}
        </div>
      )}
      {error && <div className="aisetup-error">⚠ {error}</div>}
      <div className="aisetup-models">
        {models.map(m => {
          const isRec = recommend?.recommendedId === m.id
          const isActive = settings.ai?.bundled?.model === m.id
          const p = progress[m.id]
          const isDownloading = busy === m.id
          return (
            <div key={m.id} className={`aisetup-model ${isRec ? 'rec' : ''} ${isActive ? 'active' : ''}`}>
              <div className="aisetup-model-row">
                <div className="aisetup-model-name">
                  {m.name}
                  {isRec && <span className="aisetup-tag green">RECOMMENDED</span>}
                  {isActive && <span className="aisetup-tag blue">ACTIVE</span>}
                </div>
                <div className="aisetup-model-meta">{fmt(m.sizeMB)} · ≥ {m.minRamGB} GB RAM</div>
              </div>
              <div className="aisetup-model-desc">{m.desc}</div>
              <div className="aisetup-model-actions">
                {!m.downloaded && !isDownloading && loading !== m.id && (
                  <button className="aisetup-btn-primary" onClick={() => download(m.id)}>
                    {/* Resume label if we have a partial file from a prior cancel */}
                    Download
                  </button>
                )}
                {isDownloading && (
                  <>
                    {p?.status === 'finalizing' ? (
                      <span className="aisetup-progress-text">
                        <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rec-blink 1s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                        Finalizing… (almost done)
                      </span>
                    ) : (
                      <>
                        <button className="aisetup-btn-secondary" onClick={() => cancel(m.id)}>Cancel</button>
                        <span className="aisetup-progress-text">
                          {p ? `${(p.pct * 100).toFixed(0)}% · ${(p.got / 1024 / 1024).toFixed(0)}/${(p.total / 1024 / 1024).toFixed(0)} MB` : 'Starting…'}
                        </span>
                      </>
                    )}
                  </>
                )}
                {loading === m.id && (
                  <span className="aisetup-progress-text">
                    <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rec-blink 1s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                    Loading model into RAM…
                  </span>
                )}
                {m.downloaded && !isActive && !isDownloading && loading !== m.id && (
                  <button className="aisetup-btn-primary" onClick={() => activate(m.id)}>Use this model</button>
                )}
                {m.downloaded && isActive && loading !== m.id && (
                  <button className="aisetup-btn-primary" onClick={() => onDone()}>Done ✓</button>
                )}
              </div>
              {(isDownloading && p) && (
                <div className="aisetup-progress-bar">
                  <div
                    style={{
                      width: `${p.pct * 100}%`,
                      animation: p.status === 'finalizing' ? 'rec-blink 1.2s ease-in-out infinite' : 'none'
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="aisetup-skip">
        <button className="aisetup-link" onClick={onSkip}>Skip for now — set up later in Settings</button>
      </div>
    </div>
  )
}

// ── Ollama branch ─────────────────────────────────────────────────────
function OllamaSetup({ onBack, onDone, onSkip }) {
  const [status, setStatus] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(null)
  const [error, setError] = useState(null)

  function refresh() {
    window.nexterm.ai.detectOllama().then(setStatus)
  }
  useEffect(() => {
    refresh()
    const off = window.nexterm.ai.onInstallProgress?.((p) => setInstallProgress(p))
    return () => { off?.() }
  }, [])

  async function install() {
    setError(null); setInstalling(true)
    const r = await window.nexterm.ai.installOllama()
    setInstalling(false); setInstallProgress(null)
    if (!r?.ok) { setError(r?.error || 'Install failed'); return }
    refresh()
  }

  async function startDaemon() {
    setError(null)
    const r = await window.nexterm.ai.startOllama()
    if (!r?.ok) { setError(r?.error || 'Start failed'); return }
    refresh()
  }

  return (
    <div className="aisetup">
      <div className="aisetup-header">
        <button className="aisetup-back" onClick={onBack}>← Back</button>
        <div className="aisetup-title">Set up Ollama</div>
      </div>
      <div className="aisetup-sub">
        Ollama is a separate app for managing local AI models. Great if you want lots of models and a dedicated UI.
      </div>
      <div className="aisetup-ollama">
        {status?.installed ? (
          <>
            <div className="aisetup-ok">✓ Ollama installed (v{status.version || 'unknown'})</div>
            {!status.running ? (
              <div>
                <p className="aisetup-sub">The daemon isn't running. Start it now?</p>
                <button className="aisetup-btn-primary" onClick={startDaemon}>Start Ollama</button>
              </div>
            ) : (
              <>
                <div className="aisetup-ok">✓ Daemon is running</div>
                <p className="aisetup-sub">Open Settings → AI → Local Models to pull a model (e.g. <code>qwen2.5-coder:7b</code>).</p>
                <button className="aisetup-btn-primary" onClick={onDone}>Done ✓</button>
              </>
            )}
          </>
        ) : installing ? (
          <>
            <div className="aisetup-progress-text">Installing Ollama…</div>
            {installProgress && (
              <div className="aisetup-progress-bar">
                <div style={{ width: `${(installProgress.pct || 0) * 100}%` }} />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="aisetup-sub">Ollama isn't installed. NexTerm can install it for you (no admin rights needed for per-user install).</p>
            <button className="aisetup-btn-primary" onClick={install}>Install Ollama</button>
            <p className="aisetup-sub" style={{ marginTop: 8 }}>
              Or <a className="aisetup-link" href="#" onClick={(e) => { e.preventDefault(); window.nexterm.shell.open('https://ollama.com/download') }}>visit ollama.com</a> to install manually.
            </p>
          </>
        )}
      </div>
      {error && <div className="aisetup-error">⚠ {error}</div>}
      <div className="aisetup-skip">
        <button className="aisetup-link" onClick={onSkip}>Skip for now — set up later in Settings</button>
      </div>
    </div>
  )
}

// ── Cloud branch ─────────────────────────────────────────────────────
const CLOUD_PROVIDERS = [
  { id: 'groq',       label: 'Groq',       desc: 'Free, ~30 req/min, super fast',  url: 'https://console.groq.com/keys' },
  { id: 'gemini',     label: 'Google Gemini', desc: 'Free, 1500 req/day',         url: 'https://aistudio.google.com/app/apikey' },
  { id: 'cerebras',   label: 'Cerebras',   desc: 'Free, ultra-fast inference',    url: 'https://cloud.cerebras.ai' },
  { id: 'openrouter', label: 'OpenRouter', desc: 'Free models from many providers', url: 'https://openrouter.ai/keys' }
]
function CloudSetup({ ai, onBack, onDone, onSkip }) {
  const [provider, setProvider] = useState(ai?.cloud?.provider || 'groq')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    window.nexterm.vault.get(`ai.${provider}.apiKey`).then(k => setApiKey(k || ''))
  }, [provider])

  async function saveAndTest() {
    setBusy(true); setTestResult(null)
    await window.nexterm.vault.set({ name: `ai.${provider}.apiKey`, value: apiKey.trim(), description: `AI provider: ${provider}` })
    const r = await window.nexterm.ai.testProvider({ provider, apiKey: apiKey.trim() })
    setBusy(false)
    if (r?.ok) setTestResult({ ok: true, msg: 'Key verified — ready to chat!' })
    else setTestResult({ ok: false, msg: r?.error || 'Test failed — check the key' })
  }

  const provInfo = CLOUD_PROVIDERS.find(p => p.id === provider)

  return (
    <div className="aisetup">
      <div className="aisetup-header">
        <button className="aisetup-back" onClick={onBack}>← Back</button>
        <div className="aisetup-title">Pick a cloud provider</div>
      </div>
      <div className="aisetup-cloud-list">
        {CLOUD_PROVIDERS.map(p => (
          <div
            key={p.id}
            className={`aisetup-cloud-item ${provider === p.id ? 'active' : ''}`}
            onClick={() => setProvider(p.id)}
          >
            <div className="aisetup-cloud-label">{p.label}</div>
            <div className="aisetup-cloud-desc">{p.desc}</div>
          </div>
        ))}
      </div>
      {provInfo && (
        <div className="aisetup-key-row">
          <button
            className="aisetup-btn-secondary"
            onClick={() => window.nexterm.shell.open(provInfo.url)}
          >
            Get free key ↗
          </button>
          <input
            className="aisetup-key-input"
            type="password"
            placeholder={`Paste your ${provInfo.label} API key`}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <button
            className="aisetup-btn-primary"
            disabled={busy || !apiKey.trim()}
            onClick={saveAndTest}
          >
            {busy ? 'Testing…' : 'Save & Test'}
          </button>
        </div>
      )}
      {testResult && (
        <div className={testResult.ok ? 'aisetup-ok' : 'aisetup-error'}>
          {testResult.ok ? '✓ ' : '⚠ '}{testResult.msg}
        </div>
      )}
      {testResult?.ok && (
        <button className="aisetup-btn-primary" style={{ marginTop: 8 }} onClick={() => onDone(provider)}>Done ✓</button>
      )}
      <div className="aisetup-skip">
        <button className="aisetup-link" onClick={onSkip}>Skip for now — set up later in Settings</button>
      </div>
    </div>
  )
}
