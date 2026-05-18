import { useEffect, useState } from 'react'

// Manages the optional GPU runtime download for the "online" NexTerm
// installer. Shows the current state (no GPU / runtime installed / runtime
// missing) and lets the user install or uninstall.
//
// Used in two places:
//   - Settings → AI → Built-in (full panel, persistent UI)
//   - First-launch banner (one-time toast on top of the chat)
//
// Both call the same install/uninstall flow via window.nexterm.ai.*
export default function GpuRuntimeManager({ compact = false, onDismiss = null }) {
  const [classification, setClassification] = useState(null)
  const [runtimes, setRuntimes] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)   // { runtimeId, status, pct, got, total }
  const [error, setError] = useState(null)

  async function refresh() {
    try {
      const c = await window.nexterm.ai.classifyGpuRuntime?.()
      setClassification(c)
      const list = await window.nexterm.ai.listGpuRuntimes?.()
      setRuntimes(list || [])
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const off = window.nexterm.ai.onGpuInstallProgress?.((evt) => {
      setProgress(evt)
      if (evt.status === 'done' || evt.status === 'error' || evt.pct === 1) {
        // Re-fetch to update the installed status flag.
        setTimeout(refresh, 200)
      }
    })
    return () => { if (typeof off === 'function') off() }
  }, [])

  async function install(runtimeId) {
    setBusy(true); setError(null); setProgress({ runtimeId, status: 'downloading', pct: 0 })
    try {
      const r = await window.nexterm.ai.installGpuRuntime?.(runtimeId)
      if (!r?.ok && !r?.cancelled) setError(r?.error || 'Install failed')
    } finally {
      setBusy(false)
      setProgress(null)
      refresh()
    }
  }

  async function uninstall(runtimeId) {
    setBusy(true); setError(null)
    try {
      await window.nexterm.ai.uninstallGpuRuntime?.(runtimeId)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  async function cancel(runtimeId) {
    await window.nexterm.ai.cancelGpuRuntime?.(runtimeId)
  }

  if (!classification) return null  // still loading

  const recommended = classification.runtime  // 'cuda' | 'vulkan' | 'none'
  const recommendedRuntime = runtimes.find(r => r.id === recommended)
  const anyInstalled = runtimes.some(r => r.installed)

  // Compact banner mode — one-line, dismissible. Shown on first launch.
  if (compact) {
    if (recommended === 'none') return null
    if (recommendedRuntime?.installed) return null
    return (
      <div className="gpu-banner">
        <span className="gpu-banner-icon">⚡</span>
        <div className="gpu-banner-text">
          <strong>Speed up local AI with GPU acceleration</strong>
          <span className="gpu-banner-sub">
            {classification.reason} · download {recommendedRuntime?.sizeMb} MB
          </span>
        </div>
        {progress && progress.runtimeId === recommended ? (
          <div className="gpu-banner-progress">
            <div className="gpu-bar"><div className="gpu-bar-fill" style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }} /></div>
            <span>{Math.round((progress.pct || 0) * 100)}% · {progress.status}</span>
          </div>
        ) : (
          <>
            <button className="gpu-btn gpu-btn-primary" disabled={busy} onClick={() => install(recommended)}>Install</button>
            <button className="gpu-btn gpu-btn-ghost" onClick={onDismiss}>Not now</button>
          </>
        )}
      </div>
    )
  }

  // Full panel — for Settings → AI → Built-in.
  return (
    <div className="gpu-panel">
      <div className="gpu-panel-head">
        <div>
          <div className="gpu-panel-title">GPU acceleration</div>
          <div className="gpu-panel-sub">
            {classification.gpu
              ? `${classification.gpu.name} · ${((classification.gpu.vramMb || 0) / 1024).toFixed(1)} GB VRAM`
              : 'No GPU detected'}
          </div>
        </div>
        <button className="gpu-btn gpu-btn-ghost" onClick={refresh} title="Re-detect">↻</button>
      </div>

      <div className="gpu-panel-recommended">
        {recommended === 'none'
          ? <span>Your hardware doesn't have a usable GPU for AI acceleration. Models will run on CPU.</span>
          : <span>Recommended: <strong>{runtimes.find(r => r.id === recommended)?.label}</strong></span>}
      </div>

      <div className="gpu-panel-list">
        {runtimes.map(r => {
          const isRecommended = r.id === recommended
          const isProgressing = progress && progress.runtimeId === r.id
          return (
            <div key={r.id} className={`gpu-row ${r.installed ? 'installed' : ''} ${isRecommended ? 'recommended' : ''}`}>
              <div className="gpu-row-main">
                <span className="gpu-row-label">{r.label}</span>
                {isRecommended && <span className="gpu-row-badge">recommended</span>}
                {r.installed && r.source === 'bundled' && <span className="gpu-row-badge bundled">bundled</span>}
                {r.installed && r.source === 'downloaded' && <span className="gpu-row-badge downloaded">installed</span>}
                <span className="gpu-row-size">{r.sizeMb} MB</span>
              </div>
              {isProgressing ? (
                <div className="gpu-row-progress">
                  <div className="gpu-bar"><div className="gpu-bar-fill" style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }} /></div>
                  <span>{Math.round((progress.pct || 0) * 100)}% · {progress.status}</span>
                  <button className="gpu-btn gpu-btn-ghost" onClick={() => cancel(r.id)}>Cancel</button>
                </div>
              ) : r.installed && r.source === 'downloaded' ? (
                <button className="gpu-btn gpu-btn-ghost" disabled={busy} onClick={() => uninstall(r.id)}>Uninstall</button>
              ) : r.installed && r.source === 'bundled' ? (
                <span className="gpu-row-note">Included in offline installer</span>
              ) : (
                <button
                  className={`gpu-btn ${isRecommended ? 'gpu-btn-primary' : 'gpu-btn-secondary'}`}
                  disabled={busy}
                  onClick={() => install(r.id)}
                >Install</button>
              )}
            </div>
          )
        })}
      </div>

      {error && <div className="gpu-error">⚠ {error}</div>}
    </div>
  )
}
