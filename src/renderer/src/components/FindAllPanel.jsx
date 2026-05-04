import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { paneRegistry } from './Terminal'

// Search every open xterm's scrollback for the query and group results by tab.
function searchAll(query) {
  if (!query) return []
  const q = query.toLowerCase()
  const results = []
  for (const [paneId, info] of paneRegistry.entries()) {
    const xterm = info.xterm
    if (!xterm) continue
    const buf = xterm.buffer.active
    const matches = []
    for (let i = 0; i < buf.length && matches.length < 20; i++) {
      const line = buf.getLine(i)
      if (!line) continue
      const text = line.translateToString(true)
      const idx = text.toLowerCase().indexOf(q)
      if (idx >= 0) {
        matches.push({ lineNumber: i, text, col: idx })
      }
    }
    if (matches.length) results.push({ paneId, tabId: info.tabId, matches })
  }
  return results
}

export default function FindAllPanel({ onClose }) {
  const tabs = useStore(s => s.tabs)
  const setActive = useStore(s => s.setActive)
  const setActivePane = useStore(s => s.setActivePane)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (!query) { setResults([]); return }
    const t = setTimeout(() => setResults(searchAll(query)), 80)
    return () => clearTimeout(t)
  }, [query])

  function jumpTo(paneId, tabId, lineNumber) {
    setActive(tabId)
    setActivePane(tabId, paneId)
    const info = paneRegistry.get(paneId)
    if (info?.xterm) {
      try { info.xterm.scrollToLine(lineNumber) } catch {}
    }
    onClose()
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Find across all tabs…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        <div className="palette-list" style={{ maxHeight: '60vh' }}>
          {!query && (
            <div style={{ padding: 16, opacity: 0.5, fontSize: 12 }}>
              Type to search every open pane's scrollback.
            </div>
          )}
          {query && results.length === 0 && (
            <div style={{ padding: 16, opacity: 0.5, fontSize: 12 }}>
              No matches in any open pane.
            </div>
          )}
          {results.map(r => {
            const tab = tabs.find(t => t.id === r.tabId)
            return (
              <div key={r.paneId} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
                  {tab?.name || 'Tab'} <span style={{ opacity: 0.5 }}>· {r.matches.length} match{r.matches.length === 1 ? '' : 'es'}</span>
                </div>
                {r.matches.map((m, i) => (
                  <div
                    key={i}
                    className="palette-item"
                    onClick={() => jumpTo(r.paneId, r.tabId, m.lineNumber)}
                    style={{ fontFamily: 'monospace', fontSize: 11, paddingLeft: 24 }}
                    title={`Line ${m.lineNumber + 1}`}
                  >
                    <span style={{ opacity: 0.4, marginRight: 8 }}>L{m.lineNumber + 1}</span>
                    <Highlighted text={m.text} q={query} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Highlighted({ text, q }) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  const before = text.slice(Math.max(0, idx - 30), idx)
  const match  = text.slice(idx, idx + q.length)
  const after  = text.slice(idx + q.length, idx + q.length + 80)
  return (
    <>
      <span style={{ opacity: 0.6 }}>{before}</span>
      <span style={{ background: 'rgba(234, 179, 8, 0.35)', color: 'inherit' }}>{match}</span>
      <span style={{ opacity: 0.7 }}>{after}</span>
    </>
  )
}
