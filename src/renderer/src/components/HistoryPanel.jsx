import { useState, useEffect } from 'react'
import { useStore } from '../store'

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortPath(p) {
  if (!p) return ''
  const parts = p.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return p
  return '…\\' + parts.slice(-2).join('\\')
}

const SCOPES = [
  { v: 'all',  l: 'All folders'      },
  { v: 'cwd',  l: 'Current folder'   },
  { v: 'tree', l: 'Current + subdirs'}
]

export default function HistoryPanel({ onClose }) {
  const { tabs, activeId, cwds } = useStore()
  const activeTab    = tabs.find(t => t.id === activeId)
  const activePaneId = activeTab?.activePane
  const currentCwd   = cwds[activePaneId] || ''

  const [items, setItems]   = useState([])
  const [search, setSearch] = useState('')
  const [scope,  setScope]  = useState('all')

  async function load() {
    const data = await window.nexterm.history.get({
      limit:  500,
      search,
      scope,
      cwd:    scope === 'all' ? undefined : currentCwd
    })
    setItems(data)
  }

  useEffect(() => { load() }, [search, scope, currentCwd])

  async function clearHistory() {
    const ok = await window.nexterm.confirm({
      message: 'Clear all command history?',
      detail: 'This permanently deletes every saved command across all folders. Cannot be undone.',
      danger: true
    })
    if (!ok) return
    await window.nexterm.history.clear()
    load()
  }

  function run(cmd) {
    if (activePaneId) window.nexterm.pty.write(activePaneId, cmd + '\r')
    onClose()
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span>Command History</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-danger" onClick={clearHistory}>Clear</button>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>
      </div>

      <div style={{ padding: '6px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SCOPES.map(s => (
          <button
            key={s.v}
            className={`cursor-opt ${scope === s.v ? 'active' : ''}`}
            onClick={() => setScope(s.v)}
            style={{ fontSize: 11 }}
            disabled={s.v !== 'all' && !currentCwd}
            title={s.v !== 'all' && !currentCwd ? 'No CWD detected yet — run a command in the active terminal' : ''}
          >
            {s.l}
          </button>
        ))}
      </div>

      {scope !== 'all' && currentCwd && (
        <div style={{ padding: '4px 12px', fontSize: 10, opacity: 0.55, fontFamily: 'monospace' }}>
          📁 {currentCwd}
        </div>
      )}

      <input
        className="history-search"
        placeholder="Search history…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />

      <div className="history-list">
        {items.length === 0 && (
          <div style={{ padding: '16px', opacity: 0.4, fontSize: 12, textAlign: 'center' }}>
            {scope === 'all'
              ? 'No history yet. Commands you run will appear here.'
              : 'No history for this folder yet.'}
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            className="history-item"
            onClick={() => run(item.command)}
            title={`Click to run\nFolder: ${item.directory || '(unknown)'}`}
          >
            <span className="cmd">{item.command}</span>
            <span className="ts">
              {formatTime(item.timestamp)}
              {item.directory ? ` · ${shortPath(item.directory)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
