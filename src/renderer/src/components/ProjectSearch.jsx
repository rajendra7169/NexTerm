import { useEffect, useRef, useState } from 'react'

// Find-in-Project panel. Searches file contents recursively under the project,
// shows results grouped by file. Each match has its line snippet — click to
// jump to that line in the editor.
export default function ProjectSearch({ projectPath, onOpenLocation, onClose }) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [truncated, setTruncated] = useState(false)
  const inputRef = useRef(null)
  const reqIdRef = useRef(0)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); setTruncated(false); return }
    const id = ++reqIdRef.current
    setBusy(true); setError(null)
    const handle = setTimeout(async () => {
      const r = await window.nexterm.project.search(projectPath, query, { caseSensitive, wholeWord, regex })
      if (id !== reqIdRef.current) return  // stale
      setBusy(false)
      if (!r?.ok) { setError(r?.error || 'Search failed'); setResults([]); return }
      setResults(r.results || [])
      setTruncated(!!r.truncated)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, caseSensitive, wholeWord, regex, projectPath])

  const total = results.reduce((acc, r) => acc + r.matches.length, 0)

  function fileLabel(path) { return path.split(/[\\/]/).pop() }
  function dirLabel(rel)   {
    const slash = rel.lastIndexOf('/')
    return slash >= 0 ? rel.slice(0, slash) : ''
  }

  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); onClose() } }

  return (
    <div className="qo-backdrop" onMouseDown={onClose}>
      <div className="qo-panel ps-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ps-header">
          <input
            ref={inputRef}
            className="qo-input"
            placeholder="Search across all files"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <div className="ps-options">
            <button className={`ps-opt ${caseSensitive ? 'on' : ''}`} onClick={() => setCaseSensitive(v => !v)} title="Match case">Aa</button>
            <button className={`ps-opt ${wholeWord     ? 'on' : ''}`} onClick={() => setWholeWord(v => !v)}      title="Whole word">ab</button>
            <button className={`ps-opt ${regex         ? 'on' : ''}`} onClick={() => setRegex(v => !v)}          title="Regex">.*</button>
          </div>
        </div>

        {busy   && <div className="ps-status">Searching…</div>}
        {error  && <div className="ps-status error">{error}</div>}
        {!busy && !error && query.trim() && (
          <div className="ps-status">
            {total === 0 ? 'No matches' : `${total} match${total === 1 ? '' : 'es'} in ${results.length} file${results.length === 1 ? '' : 's'}${truncated ? ' (truncated)' : ''}`}
          </div>
        )}

        <div className="ps-results">
          {results.map((file) => (
            <div key={file.path} className="ps-file">
              <div className="ps-file-row" title={file.path}>
                <span className="ps-file-name">{fileLabel(file.path)}</span>
                <span className="ps-file-dir">{dirLabel(file.rel)}</span>
                <span className="ps-file-count">{file.matches.length}</span>
              </div>
              {file.matches.map((m, i) => (
                <div
                  key={i}
                  className="ps-match-row"
                  onClick={() => { onOpenLocation(file.path, m.line, m.col); onClose() }}
                  title={`${file.rel}:${m.line}`}
                >
                  <span className="ps-line-num">{m.line}</span>
                  <span className="ps-line-text">{m.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="qo-footer">
          <span>Type to search</span>
          <span>Click a match to jump</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
