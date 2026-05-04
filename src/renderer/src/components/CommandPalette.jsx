import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function CommandPalette({ onClose, onSettings, onHistory, onProfiles }) {
  const { addTab, removeTab, splitActivePane, closePane,
          activeId, updateSettings, settings } = useStore()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  const COMMANDS = [
    { label: 'New Tab',                kbd: 'Ctrl+Shift+T', run: () => addTab() },
    { label: 'Close Pane / Tab',       kbd: 'Ctrl+Shift+W', run: () => closePane() },
    { label: 'Split Right',            kbd: 'Ctrl+Shift+D', run: () => splitActivePane('row') },
    { label: 'Split Down',             kbd: 'Ctrl+Shift+E', run: () => splitActivePane('col') },
    { label: 'Open Settings',          kbd: 'Ctrl+,',       run: () => onSettings() },
    { label: 'Open History',           kbd: 'Ctrl+H',       run: () => onHistory() },
    { label: 'SSH Profiles',           kbd: 'Ctrl+Shift+S', run: () => onProfiles() },
    { label: 'Search in Terminal',     kbd: 'Ctrl+F',       run: () => {} },
    { label: 'Theme: Tokyo Night',     run: () => updateSettings({ theme: 'tokyonight' }) },
    { label: 'Theme: Dracula',         run: () => updateSettings({ theme: 'dracula' }) },
    { label: 'Theme: Nord',            run: () => updateSettings({ theme: 'nord' }) },
    { label: 'Theme: Catppuccin',      run: () => updateSettings({ theme: 'catppuccin' }) },
    { label: 'Theme: Gruvbox',         run: () => updateSettings({ theme: 'gruvbox' }) },
    { label: 'Theme: Solarized Dark',  run: () => updateSettings({ theme: 'solarizedDark' }) },
    { label: 'Theme: Solarized Light', run: () => updateSettings({ theme: 'solarizedLight' }) },
    { label: 'Theme: Monokai',         run: () => updateSettings({ theme: 'monokai' }) },
    { label: 'Theme: One Dark',        run: () => updateSettings({ theme: 'oneDark' }) },
    { label: 'Theme: Synthwave 84',    run: () => updateSettings({ theme: 'synthwave' }) },
    { label: 'Theme: Ayu Dark',        run: () => updateSettings({ theme: 'ayuDark' }) },
    { label: 'Theme: Ayu Mirage',      run: () => updateSettings({ theme: 'ayuMirage' }) },
    { label: 'Theme: GitHub Dark',     run: () => updateSettings({ theme: 'githubDark' }) },
    { label: 'Theme: GitHub Light',    run: () => updateSettings({ theme: 'githubLight' }) },
    { label: 'Theme: Rosé Pine',       run: () => updateSettings({ theme: 'rosePine' }) },
    { label: 'Theme: Material Ocean',  run: () => updateSettings({ theme: 'materialOcean' }) },
    { label: 'Theme: Cyberpunk',       run: () => updateSettings({ theme: 'cyberpunk' }) },
    { label: 'Theme: Everforest',      run: () => updateSettings({ theme: 'everforest' }) },
    { label: 'Theme: Light',           run: () => updateSettings({ theme: 'light' }) },
    { label: 'Toggle Suggestions',     run: () => updateSettings({ suggestions: !settings.suggestions }) },
    { label: 'Font Size +',            run: () => updateSettings({ fontSize: Math.min(32, (settings.fontSize || 14) + 1) }) },
    { label: 'Font Size –',            run: () => updateSettings({ fontSize: Math.max(8,  (settings.fontSize || 14) - 1) }) }
  ]

  const filtered = query.trim()
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS

  useEffect(() => { setSel(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  const run = (cmd) => { cmd.run(); onClose() }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
            if (e.key === 'Enter' && filtered[sel]) run(filtered[sel])
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && (
            <div style={{ padding: '12px 16px', opacity: 0.5, fontSize: 13 }}>No commands found</div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label}
              className={`palette-item ${i === sel ? 'selected' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.kbd && <kbd className="kbd">{cmd.kbd}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
