import { useEffect, useState } from 'react'
import { useStore } from '../store'

function shortenPath(p) {
  if (!p) return ''
  const parts = p.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) return p
  return '…' + (p.includes('\\') ? '\\' : '/') + parts.slice(-2).join(p.includes('\\') ? '\\' : '/')
}

function fmtClock(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Color thresholds — match the banner pctBar palette: green <50, yellow <80, red ≥80.
function loadColor(pct) {
  if (pct == null) return 'transparent'
  if (pct >= 80) return '#ef4444'
  if (pct >= 50) return '#eab308'
  return '#22c55e'
}

function LoadBar({ label, pct, title }) {
  if (pct == null) return null
  return (
    <span className="status-cell status-load" title={title || `${label} ${pct}%`}>
      <span className="status-load-label">{label}</span>
      <span className="status-load-track">
        <span className="status-load-fill" style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: loadColor(pct)
        }} />
      </span>
      <span className="status-load-pct">{pct}%</span>
    </span>
  )
}

export default function StatusBar() {
  const { tabs, activeId, cwds, settings } = useStore()
  const tab     = tabs.find(t => t.id === activeId)
  const paneId  = tab?.activePane
  const cwd     = (paneId && cwds[paneId]) || ''
  const [git,  setGit]  = useState({ branch: null, dirty: false })
  const [now,  setNow]  = useState(new Date())
  const [load, setLoad] = useState({ cpu: null, gpu: null, ram: null })

  // Tick the clock once per minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(t)
  }, [])

  // Live CPU/GPU/RAM — poll every 2s. The IPC handler samples on demand
  // (200ms CPU delta + nvidia-smi GPU + instant RAM) so values are real-time.
  useEffect(() => {
    let cancelled = false
    let timer = null
    const tick = async () => {
      try {
        const r = await window.nexterm.system.load()
        if (!cancelled && r) setLoad(r)
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 2000)
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  // Refresh git info when cwd changes
  useEffect(() => {
    let cancelled = false
    if (!cwd) { setGit({ branch: null, dirty: false }); return }
    window.nexterm.git.info(cwd).then(info => { if (!cancelled) setGit(info || { branch: null, dirty: false }) })
    return () => { cancelled = true }
  }, [cwd])

  if (settings.showStatusBar === false) return null

  return (
    <div className="status-bar">
      <span className="status-cell" title={cwd || ''}>
        <span className="status-icon">📁</span>
        {shortenPath(cwd) || '—'}
      </span>
      {git.branch && (
        <span className="status-cell" title={`Git branch: ${git.branch}${git.dirty ? ' (dirty)' : ''}`}>
          <span className="status-icon">⎇</span>
          {git.branch}
          {git.dirty && <span className="status-dirty" title="Uncommitted changes">●</span>}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {tab?.broadcast && (
        <span className="status-cell status-warn" title="Input is being mirrored to all panes in this tab">
          📡 BROADCAST
        </span>
      )}
      <LoadBar label="CPU" pct={load.cpu} />
      <LoadBar label="GPU" pct={load.gpu} title={load.gpu == null ? 'GPU usage unavailable (no NVIDIA driver)' : undefined} />
      <LoadBar label="RAM" pct={load.ram} />
      <span className="status-cell" title={now.toLocaleString()}>
        {fmtClock(now)}
      </span>
    </div>
  )
}
