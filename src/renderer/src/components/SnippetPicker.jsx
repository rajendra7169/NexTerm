import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'

// Parses ${name} or ${name:default} placeholders. Returns array of {raw, name, default}.
function parsePlaceholders(text) {
  const out = []
  const re = /\$\{([a-zA-Z_][\w-]*)(?::([^}]*))?\}/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (!out.find(p => p.name === m[1])) {
      out.push({ raw: m[0], name: m[1], default: m[2] || '' })
    }
  }
  return out
}

function fillPlaceholders(text, values) {
  return text.replace(/\$\{([a-zA-Z_][\w-]*)(?::[^}]*)?\}/g, (_, name) => values[name] ?? '')
}

export default function SnippetPicker({ onClose, onInsert }) {
  const settings = useStore(s => s.settings)
  const snippets = settings.snippets || []
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(null)  // snippet object once user has picked
  const [values, setValues] = useState({})
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return snippets
    const q = query.toLowerCase()
    return snippets.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.command || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    )
  }, [snippets, query])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelected(0) }, [query])

  function pick(snip) {
    const ph = parsePlaceholders(snip.command || '')
    if (ph.length === 0) {
      onInsert(snip.command || '')
      onClose()
      return
    }
    const initial = {}
    ph.forEach(p => initial[p.name] = p.default)
    setValues(initial)
    setPending(snip)
  }

  function commitPlaceholders() {
    const filled = fillPlaceholders(pending.command, values)
    onInsert(filled)
    onClose()
  }

  function onKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (pending) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[selected]) pick(filtered[selected]) }
  }

  if (pending) {
    const ph = parsePlaceholders(pending.command || '')
    return (
      <div className="palette-backdrop" onClick={onClose}>
        <div className="palette" onClick={e => e.stopPropagation()}>
          <div className="palette-header">{pending.name}</div>
          <div style={{ padding: 12, fontSize: 12, opacity: 0.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {pending.command}
          </div>
          {ph.map(p => (
            <div key={p.name} className="form-row" style={{ padding: '4px 12px' }}>
              <label style={{ minWidth: 100 }}>{p.name}</label>
              <input
                className="settings-input"
                value={values[p.name] ?? ''}
                onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') commitPlaceholders() }}
                placeholder={p.default || ''}
                autoFocus={p === ph[0]}
              />
            </div>
          ))}
          <div style={{ padding: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setPending(null)}>Back</button>
            <button className="btn-primary"   onClick={commitPlaceholders}>Insert</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()} onKeyDown={onKey}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search snippets…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="palette-list">
          {filtered.length === 0 && (
            <div style={{ padding: 16, opacity: 0.5, fontSize: 12 }}>
              No snippets. Add some in Settings → Snippets.
            </div>
          )}
          {filtered.map((s, i) => (
            <div
              key={s.id || i}
              className={`palette-item ${i === selected ? 'active' : ''}`}
              onClick={() => pick(s)}
              onMouseEnter={() => setSelected(i)}
            >
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.command}
              </div>
              {s.description && (
                <div style={{ fontSize: 11, opacity: 0.5 }}>{s.description}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
