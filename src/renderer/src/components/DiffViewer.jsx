import { useEffect, useState } from 'react'

// Lightweight unified-diff renderer. Parses a `git diff` patch into hunks
// and renders each line with the appropriate add/remove/context coloring.
function parseDiff(patch) {
  const files = []
  let current = null
  let hunk = null
  for (const raw of (patch || '').split('\n')) {
    if (raw.startsWith('diff --git')) {
      // Start a new file
      const m = raw.match(/^diff --git a\/(.+) b\/(.+)$/)
      current = { from: m?.[1] || '?', to: m?.[2] || '?', hunks: [] }
      files.push(current)
      hunk = null
    } else if (raw.startsWith('@@')) {
      if (!current) continue
      hunk = { header: raw, lines: [] }
      current.hunks.push(hunk)
    } else if (raw.startsWith('---') || raw.startsWith('+++')) {
      continue
    } else if (raw.startsWith('new file mode') || raw.startsWith('deleted file mode') || raw.startsWith('similarity ') || raw.startsWith('rename ') || raw.startsWith('index ') || raw.startsWith('Binary files ')) {
      continue
    } else if (hunk) {
      if (raw.startsWith('+'))      hunk.lines.push({ type: 'add', text: raw.slice(1) })
      else if (raw.startsWith('-')) hunk.lines.push({ type: 'del', text: raw.slice(1) })
      else                          hunk.lines.push({ type: 'ctx', text: raw.replace(/^ /, '') })
    }
  }
  return files
}

export default function DiffViewer({ title, loader, onClose }) {
  const [patch, setPatch] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null); setPatch(null)
    Promise.resolve(loader()).then(r => {
      if (cancelled) return
      if (!r?.ok) { setError(r?.error || 'Failed to load diff'); return }
      setPatch(r.diff || '')
    }).catch(e => {
      if (!cancelled) setError(String(e?.message || e))
    })
    return () => { cancelled = true }
  }, [loader])

  const files = parseDiff(patch || '')
  const totalLines = files.reduce((a, f) => a + f.hunks.reduce((b, h) => b + h.lines.length, 0), 0)

  return (
    <div className="qo-backdrop" onMouseDown={onClose}>
      <div className="qo-panel diff-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="diff-header">
          <span className="diff-title">{title}</span>
          <span className="diff-meta">
            {patch === null ? 'Loading…' : `${files.length} file${files.length === 1 ? '' : 's'} · ${totalLines} lines`}
          </span>
          <button className="diff-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="diff-error">{error}</div>}
        {!error && patch !== null && (
          <div className="diff-body">
            {files.length === 0 && <div className="diff-empty">No changes</div>}
            {files.map((f, i) => (
              <div key={i} className="diff-file">
                <div className="diff-file-name" title={f.to}>
                  {f.from !== f.to ? `${f.from} → ${f.to}` : f.to}
                </div>
                {f.hunks.map((h, hi) => (
                  <div key={hi} className="diff-hunk">
                    <div className="diff-hunk-header">{h.header}</div>
                    {h.lines.map((ln, li) => (
                      <div key={li} className={`diff-line diff-${ln.type}`}>
                        <span className="diff-sign">{ln.type === 'add' ? '+' : ln.type === 'del' ? '−' : ' '}</span>
                        <span className="diff-text">{ln.text}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
