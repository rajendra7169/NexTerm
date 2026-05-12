import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// VS Code-style top menu bar. Each menu opens a dropdown. Items can be
// disabled based on context (no Save when not in editor, etc.).
export default function MenuBar({ onSettings, onHistory, onPalette, onProfiles, onAi }) {
  const [open, setOpen] = useState(null)   // 'File' | 'Edit' | 'View' | ...
  const rootRef = useRef(null)

  const tabs       = useStore(s => s.tabs)
  const activeId   = useStore(s => s.activeId)
  const settings   = useStore(s => s.settings)
  const setSettings= useStore(s => s.setSettings)
  const addTab     = useStore(s => s.addTab)
  const removeTab  = useStore(s => s.removeTab)
  const addEditorTab        = useStore(s => s.addEditorTab)
  const toggleBottomTerm    = useStore(s => s.toggleBottomTerminal)
  const closeFileInEditor   = useStore(s => s.closeFileInEditor)

  const activeTab = tabs.find(t => t.id === activeId)
  const inEditor  = activeTab?.type === 'editor'

  // Dismiss menu when clicking outside.
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [open])

  // ESC closes
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function openProject(explicitNewWindow) {
    const dir = await window.nexterm.project.pickFolder()
    if (!dir) return
    // Read settings live so the toggle works without remounting the menu.
    const liveSettings = useStore.getState().settings
    const useNewWindow = explicitNewWindow !== undefined
      ? explicitNewWindow
      : liveSettings.coder?.openInNewWindow !== false
    console.log('[MenuBar] openProject', { dir, useNewWindow, explicit: explicitNewWindow, settingVal: liveSettings.coder?.openInNewWindow })
    if (useNewWindow) {
      const r = await window.nexterm.window.openWith({ kind: 'editor', projectPath: dir })
      console.log('[MenuBar] openWith result', r)
      if (!r?.ok) {
        // Fall back to opening in this window if the new-window IPC failed.
        addEditorTab(dir)
      }
    } else {
      addEditorTab(dir)
    }
  }

  async function newWindow() {
    await window.nexterm.window.openWith({ kind: 'blank' })
  }

  async function moveTabToNewWindow() {
    if (!activeTab) return
    // For editor tabs, just open the project in a new window then close current.
    if (activeTab.type === 'editor') {
      await window.nexterm.window.openWith({ kind: 'editor', projectPath: activeTab.projectPath })
      removeTab(activeTab.id)
    } else {
      // Terminal tab — open a fresh blank window for now (re-attaching the live
      // PTY across windows is a bigger lift). The user can re-open the shell.
      await window.nexterm.window.openWith({ kind: 'blank' })
    }
  }

  function save() {
    // Save is implemented inside Editor.jsx via Ctrl+S handler; trigger it.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  }

  const Menus = [
    {
      label: 'File',
      items: [
        { label: 'New Tab',                          shortcut: 'Ctrl+T',         action: () => addTab() },
        { label: 'Open Project…',                    shortcut: 'Ctrl+Shift+O',   action: () => openProject() },
        { label: 'Open Project in New Window…',                                  action: () => openProject(true) },
        { label: 'New Window',                       shortcut: 'Ctrl+Shift+N',   action: newWindow },
        { sep: true },
        { label: 'Save',                             shortcut: 'Ctrl+S',         disabled: !inEditor,                 action: save },
        { sep: true },
        { label: 'Close Tab',                        shortcut: 'Ctrl+W',         action: () => activeId && removeTab(activeId) },
        { label: 'Settings…',                        shortcut: 'Ctrl+,',         action: onSettings },
        { sep: true },
        { label: 'Exit',                             action: () => window.nexterm.win.close() }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo',  shortcut: 'Ctrl+Z',   action: () => document.execCommand('undo') },
        { label: 'Redo',  shortcut: 'Ctrl+Y',   action: () => document.execCommand('redo') },
        { sep: true },
        { label: 'Cut',   shortcut: 'Ctrl+X',   action: () => document.execCommand('cut') },
        { label: 'Copy',  shortcut: 'Ctrl+C',   action: () => document.execCommand('copy') },
        { label: 'Paste', shortcut: 'Ctrl+V',   action: () => document.execCommand('paste') },
        { sep: true },
        { label: 'Find',  shortcut: 'Ctrl+F',
          action: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })) }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Command Palette…',         shortcut: 'Ctrl+Shift+P',   action: onPalette },
        { label: 'History…',                 shortcut: 'Ctrl+H',         action: onHistory },
        { label: 'SSH Profiles…',                                        action: onProfiles },
        { sep: true },
        { label: settings.hideTabsInCoder !== false ? '✓ Hide tab bar in Coder mode' : '  Hide tab bar in Coder mode',
          action: () => setSettings({ hideTabsInCoder: settings.hideTabsInCoder === false }) },
        { sep: true },
        { label: 'Toggle Fullscreen', shortcut: 'F11',
          action: () => window.nexterm.win.maximize() }
      ]
    },
    {
      label: 'Terminal',
      items: [
        { label: 'New Terminal Tab',                shortcut: 'Ctrl+T',  action: () => addTab() },
        { label: 'Toggle Bottom Terminal',          shortcut: 'Ctrl+`',  disabled: !inEditor,
          action: () => inEditor && toggleBottomTerm(activeId) }
      ]
    },
    {
      label: 'Project',
      items: [
        { label: 'Open Project…',                shortcut: 'Ctrl+Shift+O',  action: () => openProject() },
        { label: 'Open Project in New Window…',                              action: () => openProject(true) },
        { sep: true },
        { label: 'Move Current Tab to New Window', disabled: !activeTab,
          action: moveTabToNewWindow }
      ]
    },
    {
      label: 'AI',
      items: [
        { label: 'Toggle AI Chat',  shortcut: 'Ctrl+Shift+A',   action: onAi },
        { sep: true },
        { label: 'AI Settings…',  action: onSettings }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'GitHub',
          action: () => window.nexterm.shell.open('https://github.com/rajendra7169/NexTerm') },
        { label: 'Report an Issue',
          action: () => window.nexterm.shell.open('https://github.com/rajendra7169/NexTerm/issues/new') },
        { sep: true },
        { label: `About NexTerm v${'0.2.0'}`, disabled: true }
      ]
    }
  ]

  function runItem(item) {
    setOpen(null)
    if (item.disabled || item.sep) return
    try { item.action?.() } catch (e) { console.error('[Menu]', e) }
  }

  console.log('[MenuBar] render, open=', open)
  const termBtnActive = inEditor && activeTab?.bottomVisible
  return (
    <div
      ref={rootRef}
      className="menu-bar"
    >
      {Menus.map(m => (
        <button
          key={m.label}
          type="button"
          className={`menu-bar-item ${open === m.label ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            console.log('[Menu] CLICKED', m.label, '— open was', open)
            setOpen(open === m.label ? null : m.label)
          }}
          onMouseEnter={() => { if (open && open !== m.label) setOpen(m.label) }}
        >
          <span>{m.label}</span>
          {open === m.label && (
            <div className="menu-dropdown" onClick={(e) => e.stopPropagation()}>
              {m.items.map((it, i) =>
                it.sep
                  ? <div key={'sep-' + i} className="menu-sep" />
                  : (
                    <button
                      key={it.label + i}
                      type="button"
                      className={`menu-item ${it.disabled ? 'disabled' : ''}`}
                      onClick={(e) => { e.stopPropagation(); runItem(it) }}
                    >
                      <span className="menu-item-label">{it.label}</span>
                      {it.shortcut && <span className="menu-item-shortcut">{it.shortcut}</span>}
                    </button>
                  )
              )}
            </div>
          )}
        </button>
      ))}

      <div className="menu-bar-spacer" />

      {inEditor && (
        <button
          type="button"
          className={`menu-bar-action ${termBtnActive ? 'active' : ''}`}
          onClick={() => toggleBottomTerm(activeId)}
          title="Toggle terminal panel (Ctrl+`)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
            <path d="M4 6l2 2-2 2M7 10h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
