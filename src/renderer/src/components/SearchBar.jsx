import { useState, useRef, useEffect } from 'react'

export default function SearchBar({ onFind, onFindPrev, onClose }) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function find(q = query) {
    if (q) onFind(q, { caseSensitive, wholeWord, incremental: true })
  }

  function findPrev(q = query) {
    if (q) onFindPrev(q, { caseSensitive, wholeWord })
  }

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); find(e.target.value) }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.shiftKey ? findPrev() : find()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Search terminal… (Enter / Shift+Enter)"
      />
      <button onClick={() => findPrev()} title="Previous (Shift+Enter)">↑</button>
      <button onClick={() => find()} title="Next (Enter)">↓</button>
      <button
        className={caseSensitive ? 'active' : ''}
        onClick={() => { const v = !caseSensitive; setCaseSensitive(v); find(query) }}
        title="Case sensitive"
      >Aa</button>
      <button
        className={wholeWord ? 'active' : ''}
        onClick={() => { const v = !wholeWord; setWholeWord(v); find(query) }}
        title="Whole word"
      >W</button>
      <button onClick={onClose} title="Close (Esc)">×</button>
    </div>
  )
}
