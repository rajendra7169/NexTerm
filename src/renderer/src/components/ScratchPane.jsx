import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function ScratchPane({ pane, tabId, active }) {
  const settings = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const setActivePane = useStore(s => s.setActivePane)
  const taRef = useRef(null)

  // Pane id namespaces the content so multiple scratchpads don't clobber each other
  const key = pane.id
  const all = settings.scratchpads || {}
  const value = all[key] ?? all['__legacy__'] ?? ''

  useEffect(() => {
    if (active) setTimeout(() => taRef.current?.focus(), 30)
  }, [active])

  function onChange(e) {
    const next = { ...all, [key]: e.target.value }
    updateSettings({ scratchpads: next })
  }

  return (
    <div
      className={`pane-wrap ${active ? 'pane-active' : ''} scratchpad-wrap`}
      onMouseDown={() => setActivePane(tabId, pane.id)}
    >
      <div className="scratchpad-header">📝 Scratchpad — autosaved</div>
      <textarea
        ref={taRef}
        className="scratchpad-textarea"
        spellCheck={false}
        value={value}
        onChange={onChange}
        placeholder="Notes, snippets, anything you don't want to lose. Persists across restarts."
      />
    </div>
  )
}
