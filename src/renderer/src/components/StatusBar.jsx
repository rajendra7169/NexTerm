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
  const isEditor = tab?.type === 'editor'
  // For terminal tabs: cwd of the active pane (live, updated via OSC 7).
  // For editor tabs: there is no PTY, so use the project's root path.
  const cwd = isEditor
    ? (tab?.projectPath || '')
    : ((paneId && cwds[paneId]) || '')
  const [git,  setGit]  = useState({ branch: null, dirty: false })
  const [now,  setNow]  = useState(new Date())
  const [load, setLoad] = useState({ cpu: null, gpu: null, ram: null })
  // Rich editor-mode git info (ahead/behind + modified count) sourced from
  // the same gitc:status the Source Control panel uses.
  const [coderGit, setCoderGit] = useState(null)
  // Extra live counts for the status bar
  const [counts, setCounts] = useState({ sshSessions: 0, recordings: 0 })
  const [battery, setBattery] = useState(null)

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

  // Poll live counts (SSH sessions + recordings) every 3 seconds
  useEffect(() => {
    let cancelled = false
    let timer = null
    const tick = async () => {
      try {
        const r = await window.nexterm.system.liveCounts?.()
        if (!cancelled && r) setCounts(r)
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 3000)
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  // Battery (via the Web Battery API). Only available on laptops/tablets.
  useEffect(() => {
    let battery = null
    let cancelled = false
    const update = () => {
      if (cancelled || !battery) return
      setBattery({
        level: Math.round(battery.level * 100),
        charging: !!battery.charging
      })
    }
    if (typeof navigator !== 'undefined' && navigator.getBattery) {
      navigator.getBattery().then(b => {
        if (cancelled) return
        battery = b
        update()
        battery.addEventListener('levelchange', update)
        battery.addEventListener('chargingchange', update)
      }).catch(() => {})
    }
    return () => {
      cancelled = true
      if (battery) {
        battery.removeEventListener?.('levelchange', update)
        battery.removeEventListener?.('chargingchange', update)
      }
    }
  }, [])

  // Refresh git info when cwd changes
  useEffect(() => {
    let cancelled = false
    if (!cwd) { setGit({ branch: null, dirty: false }); return }
    window.nexterm.git.info(cwd).then(info => { if (!cancelled) setGit(info || { branch: null, dirty: false }) })
    return () => { cancelled = true }
  }, [cwd])

  // For editor tabs, poll the richer git status (ahead/behind + modified count)
  // from the project's actual root, not the active pane's cwd.
  useEffect(() => {
    let cancelled = false
    let timer = null
    if (!isEditor || !tab?.projectPath) { setCoderGit(null); return }
    const tick = async () => {
      try {
        const r = await window.nexterm.gitc.status(tab.projectPath)
        if (!cancelled && r?.ok) setCoderGit(r)
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 6000)
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [isEditor, tab?.projectPath])

  if (settings.showStatusBar === false) return null

  return (
    <div className="status-bar">
      <span className="status-cell" title={cwd || ''}>
        <span className="status-icon">📁</span>
        {shortenPath(cwd) || '—'}
      </span>
      {/* For editor tabs prefer the richer coderGit (ahead/behind + modified count). */}
      {isEditor && coderGit?.isRepo ? (
        <>
          <span className="status-cell" title={`Branch ${coderGit.branch}${coderGit.headHash ? ' · HEAD ' + coderGit.headHash : ''}`}>
            <span className="status-icon">⎇</span>
            {coderGit.branch}
          </span>
          {coderGit.ahead  > 0 && <span className="status-cell" title={`${coderGit.ahead} commit${coderGit.ahead === 1 ? '' : 's'} ahead`}>↑{coderGit.ahead}</span>}
          {coderGit.behind > 0 && <span className="status-cell" title={`${coderGit.behind} commit${coderGit.behind === 1 ? '' : 's'} behind`}>↓{coderGit.behind}</span>}
          {coderGit.files?.length > 0 && (
            <span className="status-cell status-modified" title={`${coderGit.files.length} modified file${coderGit.files.length === 1 ? '' : 's'}`}>
              ● {coderGit.files.length}
            </span>
          )}
        </>
      ) : (
        git.branch && (
          <span className="status-cell" title={`Git branch: ${git.branch}${git.dirty ? ' (dirty)' : ''}`}>
            <span className="status-icon">⎇</span>
            {git.branch}
            {git.dirty && <span className="status-dirty" title="Uncommitted changes">●</span>}
          </span>
        )
      )}
      {isEditor && tab?.activeFile && (
        <span className="status-cell status-file" title={tab.activeFile}>
          {(() => {
            const rel = tab.activeFile.startsWith(tab.projectPath)
              ? tab.activeFile.slice(tab.projectPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
              : tab.activeFile
            return rel
          })()}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {tab?.broadcast && (
        <span className="status-cell status-warn" title="Input is being mirrored to all panes in this tab">
          📡 BROADCAST
        </span>
      )}
      {counts.sshSessions > 0 && (
        <span className="status-cell" title={`${counts.sshSessions} active SSH session${counts.sshSessions === 1 ? '' : 's'}`}>
          🔐 {counts.sshSessions}
        </span>
      )}
      {counts.recordings > 0 && (
        <span className="status-cell status-rec" title={`${counts.recordings} active recording${counts.recordings === 1 ? '' : 's'}`}>
          ● REC{counts.recordings > 1 ? ` ${counts.recordings}` : ''}
        </span>
      )}
      {battery && (
        <span className="status-cell" title={`Battery ${battery.level}%${battery.charging ? ' (charging)' : ''}`}>
          {battery.charging ? '⚡' : '🔋'} {battery.level}%
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
