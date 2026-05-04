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

export default function StatusBar() {
  const { tabs, activeId, cwds, settings } = useStore()
  const tab     = tabs.find(t => t.id === activeId)
  const paneId  = tab?.activePane
  const cwd     = (paneId && cwds[paneId]) || ''
  const [git,  setGit]  = useState({ branch: null, dirty: false })
  const [now,  setNow]  = useState(new Date())

  // Tick the clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(t)
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
      <span className="status-cell" title={now.toLocaleString()}>
        {fmtClock(now)}
      </span>
    </div>
  )
}
