import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'

const SHELL_PRESETS = [
  { name: 'PowerShell',    shell: 'powershell.exe',                          tag: 'PS'   },
  { name: 'PowerShell 7',  shell: 'pwsh.exe',                                tag: 'PS7'  },
  { name: 'Command Prompt',shell: 'cmd.exe',                                 tag: 'CMD'  },
  { name: 'Git Bash',      shell: 'C:\\Program Files\\Git\\bin\\bash.exe',   tag: 'BASH' },
  { name: 'WSL (Ubuntu)',  shell: 'wsl.exe',                                 tag: 'WSL'  },
  { name: 'Zsh (via WSL)', shell: 'wsl.exe', args: ['-e', 'zsh'],            tag: 'ZSH'  },
  { name: 'Fish (via WSL)',shell: 'wsl.exe', args: ['-e', 'fish'],           tag: 'FISH' },
  { name: 'Scratchpad',    scratch: true,                                    tag: 'NOTE' }
]

// Find the first leaf in a pane tree
function firstLeaf(pane) {
  if (!pane) return null
  if (pane.kind === 'leaf') return pane
  return firstLeaf(pane.a) || firstLeaf(pane.b)
}

// Derive a short tag (PS / CMD / BASH / WSL / SSH / etc.) from the leaf's shell + args
function shellTagOf(leaf, defaultShell) {
  const shellPath = leaf?.shell || defaultShell || ''
  const args      = leaf?.args || []
  const sh        = shellPath.toLowerCase()
  if (sh.includes('ssh.exe'))                     return 'SSH'
  if (sh.includes('pwsh'))                        return 'PS7'
  if (sh.includes('powershell'))                  return 'PS'
  if (sh.includes('cmd'))                         return 'CMD'
  if (sh.includes('bash'))                        return 'BASH'
  if (sh.includes('fish'))                        return 'FISH'
  if (sh.includes('zsh'))                         return 'ZSH'
  if (sh.includes('wsl')) {
    const flat = args.join(' ').toLowerCase()
    if (flat.includes('zsh'))  return 'ZSH'
    if (flat.includes('fish')) return 'FISH'
    return 'WSL'
  }
  return ''
}

const TAB_COLORS = [
  { name: 'None',   value: null      },
  { name: 'Red',    value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green',  value: '#22c55e' },
  { name: 'Cyan',   value: '#06b6d4' },
  { name: 'Blue',   value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink',   value: '#ec4899' }
]

export default function TabBar() {
  const { tabs, activeId, settings, addTab, removeTab, setActive, renameTab,
          reorderTab, togglePin, setTabColor, toggleBroadcast } = useStore()
  const defaultShell = settings.defaultShell
  const [editing, setEditing]   = useState(null)
  const [editVal, setEditVal]   = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [ctxMenu, setCtxMenu] = useState(null)   // { tabId, x, y }
  const [dragOverId, setDragOverId] = useState(null)
  const arrowRef = useRef(null)
  const menuRef  = useRef(null)
  const ctxRef   = useRef(null)

  useEffect(() => {
    if (!ctxMenu) return
    const off = (e) => {
      if (ctxRef.current?.contains(e.target)) return
      setCtxMenu(null)
    }
    setTimeout(() => document.addEventListener('mousedown', off), 0)
    return () => document.removeEventListener('mousedown', off)
  }, [ctxMenu])

  // Sort: pinned first, preserve insertion order within each group
  const sortedTabs = [...tabs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))

  useEffect(() => {
    if (!showMenu) return
    const off = (e) => {
      if (menuRef.current?.contains(e.target)) return
      if (arrowRef.current?.contains(e.target)) return
      setShowMenu(false)
    }
    setTimeout(() => document.addEventListener('mousedown', off), 0)
    return () => document.removeEventListener('mousedown', off)
  }, [showMenu])

  function toggleMenu() {
    if (showMenu) { setShowMenu(false); return }
    const r = arrowRef.current.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 4, left: r.left })
    setShowMenu(true)
  }

  function openShell(preset) {
    if (preset.scratch) {
      useStore.getState().addScratchTab()
    } else {
      addTab({
        name:  preset.name,
        shell: preset.shell,
        args:  preset.args
      })
    }
    setShowMenu(false)
  }

  function startEdit(tab, e) {
    e.stopPropagation()
    setEditing(tab.id)
    setEditVal(tab.name)
  }

  function commitEdit(id) {
    if (editVal.trim()) renameTab(id, editVal.trim())
    setEditing(null)
  }

  function onCtxMenu(tab, e) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
  }

  function onDragStart(tab, e) {
    e.dataTransfer.setData('nexterm/tab', tab.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(tab, e) {
    if (e.dataTransfer.types.includes('nexterm/tab')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverId !== tab.id) setDragOverId(tab.id)
    }
  }
  function onDrop(tab, e) {
    const fromId = e.dataTransfer.getData('nexterm/tab')
    if (fromId && fromId !== tab.id) reorderTab(fromId, tab.id)
    setDragOverId(null)
  }

  return (
    <div className="tabbar">
      {sortedTabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeId ? 'active' : ''} ${tab.pinned ? 'tab-pinned' : ''} ${dragOverId === tab.id ? 'tab-drop-target' : ''}`}
          style={tab.color ? { boxShadow: `inset 0 -2px 0 ${tab.color}` } : undefined}
          onClick={() => setActive(tab.id)}
          onDoubleClick={e => startEdit(tab, e)}
          onContextMenu={e => onCtxMenu(tab, e)}
          draggable={editing !== tab.id}
          onDragStart={e => onDragStart(tab, e)}
          onDragOver={e => onDragOver(tab, e)}
          onDrop={e => onDrop(tab, e)}
          onDragLeave={() => setDragOverId(null)}
          title={tab.name + (tab.pinned ? ' (pinned)' : '')}
        >
          {editing === tab.id ? (
            <input
              className="tab-name"
              value={editVal}
              autoFocus
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => commitEdit(tab.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit(tab.id)
                if (e.key === 'Escape') setEditing(null)
              }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'inherit', font: 'inherit', width: '100%'
              }}
            />
          ) : (
            <span className="tab-name">
              {tab.pinned && <span className="tab-pin" title="Pinned">📌</span>}
              {tab.broadcast && <span className="tab-broadcast" title="Broadcasting input to all panes">📡</span>}
              {(() => {
                const tag = shellTagOf(firstLeaf(tab.root), defaultShell)
                return tag && <span style={{ fontSize: 9, opacity: 0.5, marginRight: 4 }}>{tag}</span>
              })()}
              {tab.name}
            </span>
          )}
          {!tab.pinned && (
            <button
              className="tab-close"
              onClick={e => { e.stopPropagation(); removeTab(tab.id) }}
              title="Close tab"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <div className="tab-new-group">
        <button className="tab-add" onClick={() => addTab()} title="New tab (Ctrl+Shift+T)">+</button>
        <button
          ref={arrowRef}
          className="tab-add-arrow"
          onClick={toggleMenu}
          title="Choose shell"
        >▾</button>
      </div>
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="shell-menu tab-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <div className="shell-menu-item" onClick={() => { togglePin(ctxMenu.tabId); setCtxMenu(null) }}>
            {tabs.find(t => t.id === ctxMenu.tabId)?.pinned ? 'Unpin tab' : 'Pin tab'}
          </div>
          <div className="shell-menu-item" onClick={() => { toggleBroadcast(ctxMenu.tabId); setCtxMenu(null) }}>
            {tabs.find(t => t.id === ctxMenu.tabId)?.broadcast ? 'Stop broadcast' : 'Broadcast input to all panes'}
          </div>
          <div className="shell-menu-header" style={{ marginTop: 4 }}>Color</div>
          <div className="tab-color-row">
            {TAB_COLORS.map(c => (
              <button
                key={c.name}
                className="tab-color-swatch"
                style={{ background: c.value || 'transparent', borderStyle: c.value ? 'solid' : 'dashed' }}
                title={c.name}
                onClick={() => { setTabColor(ctxMenu.tabId, c.value); setCtxMenu(null) }}
              />
            ))}
          </div>
          <div className="shell-menu-item" style={{ color: '#ef4444' }}
               onClick={() => { removeTab(ctxMenu.tabId); setCtxMenu(null) }}>
            Close tab
          </div>
        </div>,
        document.body
      )}
      {showMenu && createPortal(
        <div
          ref={menuRef}
          className="shell-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="shell-menu-header">New tab with shell</div>
          {SHELL_PRESETS.map(p => (
            <div key={p.name} className="shell-menu-item" onClick={() => openShell(p)}>
              <span className="shell-tag">{p.tag}</span>
              <span>{p.name}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
