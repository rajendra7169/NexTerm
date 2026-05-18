import { useEffect, useState } from 'react'

// Right-side blame panel. Each row shows `author · relDate · summary` next to
// the corresponding line number from the file. Click a row to open the commit
// diff (via onShowCommit).
export default function BlamePanel({ projectPath, filePath, onClose, onShowCommit }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null); setError(null)
    window.nexterm.gitc.blame(projectPath, filePath).then(r => {
      if (cancelled) return
      if (!r?.ok) { setError(r?.error || 'Blame failed'); return }
      setEntries(r.entries || [])
    })
    return () => { cancelled = true }
  }, [projectPath, filePath])

  return (
    <div className="blame-panel">
      <div className="blame-head">
        <span className="blame-title">Blame · {filePath.split(/[\\/]/).pop()}</span>
        <button className="blame-close" onClick={onClose}>×</button>
      </div>
      {error && <div className="blame-error">{error}</div>}
      {!error && entries === null && <div className="blame-loading">Loading blame…</div>}
      {!error && entries && entries.length === 0 && <div className="blame-loading">No blame data (untracked or empty file)</div>}
      {entries && entries.length > 0 && (
        <div className="blame-list">
          {entries.map((e) => {
            const date = e.dateUnix ? new Date(e.dateUnix * 1000) : null
            const dateStr = date ? date.toLocaleDateString() : ''
            return (
              <div
                key={e.line}
                className="blame-row"
                onClick={() => onShowCommit?.(e.hash, e.summary)}
                title={`${e.author} · ${dateStr} · ${e.summary}`}
              >
                <span className="blame-line">{e.line}</span>
                <span className="blame-hash">{e.shortHash}</span>
                <span className="blame-author">{e.author}</span>
                <span className="blame-date">{dateStr}</span>
                <span className="blame-text">{e.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
