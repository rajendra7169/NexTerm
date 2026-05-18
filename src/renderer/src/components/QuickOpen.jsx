import { useEffect, useMemo, useRef, useState } from 'react'

// Simple fuzzy scorer — characters of `query` must appear in `target` in
// order. Score rewards consecutive matches and earlier hits.
function fuzzyScore(query, target) {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let prevIdx = -2
  let consecutive = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      const stride = i - prevIdx
      if (stride === 1) consecutive++
      else consecutive = 0
      // Bonus for consecutive, for word boundary, for early position.
      score += 1 + consecutive * 2
      if (i === 0 || /[\\/_\- .]/.test(t[i - 1])) score += 3
      prevIdx = i
      qi++
    }
  }
  if (qi < q.length) return 0
  // Prefer shorter targets.
  return score - t.length * 0.01
}

export default function QuickOpen({ projectPath, onPick, onClose }) {
  const [files, setFiles] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    ;(async () => {
      const r = await window.nexterm.project.listAllFiles(projectPath)
      if (r?.ok) setFiles(r.items || [])
    })()
  }, [projectPath])

  const results = useMemo(() => {
    if (!query.trim()) return files.slice(0, 200)
    const scored = []
    for (const f of files) {
      const s = fuzzyScore(query, f.rel)
      if (s > 0) scored.push({ ...f, _score: s })
    }
    scored.sort((a, b) => b._score - a._score)
    return scored.slice(0, 200)
  }, [files, query])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector('.qo-row.active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = results[active]
      if (pick) { onPick(pick.path); onClose() }
    }
  }

  return (
    <div className="qo-backdrop" onMouseDown={onClose}>
      <div className="qo-panel" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qo-input"
          placeholder={`Search ${files.length || '…'} files in project (fuzzy)`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div ref={listRef} className="qo-list">
          {results.length === 0 && <div className="qo-empty">No matching files</div>}
          {results.map((f, i) => {
            const slash = f.rel.lastIndexOf('/')
            const name = slash >= 0 ? f.rel.slice(slash + 1) : f.rel
            const dir  = slash >= 0 ? f.rel.slice(0, slash) : ''
            return (
              <div
                key={f.path}
                className={`qo-row ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onPick(f.path); onClose() }}
              >
                <span className="qo-name">{name}</span>
                {dir && <span className="qo-dir">{dir}</span>}
              </div>
            )
          })}
        </div>
        <div className="qo-footer">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
