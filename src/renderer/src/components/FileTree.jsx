import { useEffect, useState, useCallback, useRef } from 'react'
import { iconUrlForFile, iconUrlForFolder } from '../file-icons'

// Path join that respects whichever separator the parent uses (Win vs POSIX).
function joinPath(dir, name) {
  if (dir.includes('\\')) return dir.replace(/[\\/]$/, '') + '\\' + name
  return dir.replace(/[\\/]$/, '') + '/' + name
}

// Recursive directory tree. Children lazy-load when a folder is expanded.
// onOpen(path) fires when the user clicks a file (open in editor).
export default function FileTree({ rootPath, activeFile, onOpen, revealRequest, persistedExpanded, onExpandedChange }) {
  // If a persisted expansion map was passed in, use it as the initial state
  // so the tree restores its open folders after being unmounted (e.g. when
  // the user switches to the git panel and back).
  const [expanded, setExpandedLocal] = useState(persistedExpanded || { [rootPath]: true })
  // Wrap setExpanded so every update also bubbles up to the parent for
  // persistence in the store.
  const setExpanded = (updater) => {
    setExpandedLocal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { onExpandedChange?.(next) } catch {}
      return next
    })
  }
  const [children, setChildren] = useState({})   // path → items[]
  const [loading,  setLoading]  = useState({})   // path → bool
  const [contextMenu, setContextMenu] = useState(null)
  // Inline create / rename state. `creating` = { parent, isDir } when adding
  // a new entry; `renaming` = path of the entry being renamed.
  const [creating, setCreating] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef(null)
  const refreshKeyRef = useRef(0)

  useEffect(() => {
    if ((creating || renaming) && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select?.()
    }
  }, [creating, renaming])

  const loadDir = useCallback(async (dir) => {
    setLoading(l => ({ ...l, [dir]: true }))
    const r = await window.nexterm.project.list(dir)
    setLoading(l => ({ ...l, [dir]: false }))
    if (r?.ok) {
      setChildren(c => ({ ...c, [dir]: r.items }))
    }
  }, [])

  useEffect(() => { loadDir(rootPath) }, [rootPath, loadDir])

  // On mount, pre-load children for any directories that were expanded before
  // the tree was last unmounted (so the persisted expanded state is visible).
  useEffect(() => {
    if (!persistedExpanded) return
    for (const d of Object.keys(persistedExpanded)) {
      if (persistedExpanded[d] && d !== rootPath && !children[d]) loadDir(d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reveal-in-tree: expand all parent dirs of activeFile and scroll its row.
  useEffect(() => {
    if (!activeFile || !revealRequest) return
    // activeFile starts with rootPath. Walk segments between them.
    const sepChar = rootPath.includes('\\') ? '\\' : '/'
    if (!activeFile.startsWith(rootPath)) return
    const rel = activeFile.slice(rootPath.length).replace(/^[\\/]/, '')
    const parts = rel.split(/[\\/]/)
    if (parts.length <= 1) return
    let dir = rootPath
    const toExpand = []
    for (let i = 0; i < parts.length - 1; i++) {
      dir = dir.replace(/[\\/]$/, '') + sepChar + parts[i]
      toExpand.push(dir)
    }
    setExpanded(prev => {
      const next = { ...prev }
      for (const d of toExpand) next[d] = true
      return next
    })
    for (const d of toExpand) if (!children[d]) loadDir(d)
    // Wait a frame then scroll active row into view.
    setTimeout(() => {
      const list = document.querySelector('.ft-list')
      const active = list?.querySelector('.ft-row.active')
      active?.scrollIntoView({ block: 'center' })
    }, 80)
  }, [revealRequest])

  // Watch FS events — refresh affected directory.
  useEffect(() => {
    const off = window.nexterm.project.onFsEvent(({ dir, path }) => {
      if (dir !== rootPath) return
      // Reload the parent directory of the changed file.
      const parent = path.replace(/[\\/][^\\/]+$/, '')
      if (expanded[parent]) loadDir(parent)
      else if (parent === rootPath) loadDir(rootPath)
    })
    window.nexterm.project.watch(rootPath)
    return () => {
      off()
      window.nexterm.project.unwatch(rootPath)
    }
  }, [rootPath, expanded, loadDir])

  function toggle(item) {
    if (!item.isDir) return
    setExpanded(e => {
      const next = { ...e, [item.path]: !e[item.path] }
      if (next[item.path] && !children[item.path]) loadDir(item.path)
      return next
    })
  }

  // Resolve a Material Icon Theme SVG URL for any file/folder. Same icons
  // VS Code shows with the "Material Icon Theme" extension — ~1200 file
  // types, ~4600 folder names, all properly colored.
  function iconFor(item) {
    const url = item.isDir
      ? iconUrlForFolder(item.name, !!expanded[item.path])
      : iconUrlForFile(item.name)
    return url ? <img className="ft-svg" src={url} alt="" draggable={false} /> : null
  }

  function onContext(e, item) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  // Open an inline input at the top of the parent dir for creating a file/folder.
  function startNewFile(parentDir)   { setRenaming(null); setCreating({ parent: parentDir, isDir: false }); setInputValue('') }
  function startNewFolder(parentDir) { setRenaming(null); setCreating({ parent: parentDir, isDir: true });  setInputValue('') }

  async function commitCreate() {
    if (!creating) return
    const name = inputValue.trim()
    if (!name) { setCreating(null); return }
    const full = joinPath(creating.parent, name)
    const r = await window.nexterm.project.create(full, creating.isDir)
    setCreating(null); setInputValue('')
    if (!r.ok) {
      await window.nexterm.confirm({ message: 'Could not create', detail: r.error || 'Unknown error' })
      return
    }
    loadDir(creating.parent)
    if (!creating.isDir) onOpen?.(full)
  }

  function startRename(item) {
    setCreating(null); setRenaming(item.path); setInputValue(item.name)
  }

  async function commitRename() {
    if (!renaming) return
    const newName = inputValue.trim()
    const parent = renaming.replace(/[\\/][^\\/]+$/, '')
    const oldName = renaming.split(/[\\/]/).pop()
    if (!newName || newName === oldName) { setRenaming(null); return }
    const to = joinPath(parent, newName)
    const r = await window.nexterm.project.rename(renaming, to)
    setRenaming(null); setInputValue('')
    if (!r.ok) {
      await window.nexterm.confirm({ message: 'Could not rename', detail: r.error || 'Unknown error' })
      return
    }
    loadDir(parent)
  }

  async function deleteItem(item) {
    const ok = await window.nexterm.confirm({
      message: `Delete ${item.name}?`,
      detail: 'This cannot be undone from inside NexTerm.'
    })
    if (!ok) return
    const r = await window.nexterm.project.delete(item.path)
    if (!r.ok) {
      await window.nexterm.confirm({ message: 'Could not delete', detail: r.error || 'Unknown error' })
      return
    }
    const parent = item.path.replace(/[\\/][^\\/]+$/, '')
    loadDir(parent)
  }

  function renderInput(depth, iconHint) {
    return (
      <div className="ft-row ft-row-edit" style={{ paddingLeft: 6 + depth * 14 }}>
        <span className="ft-icon">{iconHint}</span>
        <input
          ref={inputRef}
          className="ft-input"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); creating ? commitCreate() : commitRename() }
            else if (e.key === 'Escape') { e.preventDefault(); setCreating(null); setRenaming(null) }
          }}
          onBlur={() => { creating ? commitCreate() : commitRename() }}
        />
      </div>
    )
  }

  function renderItems(dir, depth) {
    const items = children[dir]
    if (loading[dir] && !items) return <div className="ft-loading" style={{ paddingLeft: 14 + depth * 14 }}>…</div>
    if (!items) return null
    const showCreateHere = creating && creating.parent === dir
    if (items.length === 0 && !showCreateHere) {
      return <div className="ft-empty" style={{ paddingLeft: 14 + depth * 14 }}>(empty)</div>
    }
    return (
      <>
        {showCreateHere && renderInput(depth, creating.isDir ? '📁' : '📄')}
        {items.map(item => {
          if (renaming === item.path) {
            return <div key={item.path}>{renderInput(depth, iconFor(item))}</div>
          }
          return (
            <div key={item.path}>
              <div
                className={`ft-row ${activeFile === item.path ? 'active' : ''}`}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={() => item.isDir ? toggle(item) : onOpen?.(item.path)}
                onContextMenu={(e) => onContext(e, item)}
                title={item.path}
              >
                <span className="ft-icon">{iconFor(item)}</span>
                <span className="ft-name">{item.name}</span>
              </div>
              {item.isDir && expanded[item.path] && renderItems(item.path, depth + 1)}
            </div>
          )
        })}
      </>
    )
  }

  useEffect(() => {
    function onDocClick() { setContextMenu(null) }
    if (contextMenu) {
      window.addEventListener('click', onDocClick)
      return () => window.removeEventListener('click', onDocClick)
    }
  }, [contextMenu])

  const projectName = rootPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
  return (
    <div className="file-tree" onContextMenu={(e) => onContext(e, { path: rootPath, isDir: true, name: 'root' })}>
      <div className="ft-toolbar">
        <span className="ft-project-name" title={rootPath}>{projectName}</span>
        <div className="ft-toolbar-actions">
          <button className="ft-icon-btn" title="New file at project root" onClick={() => startNewFile(rootPath)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 2h7l3 3v9H3z" />
              <path d="M10 2v3h3" />
              <path d="M8 8v4M6 10h4" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ft-icon-btn" title="New folder at project root" onClick={() => startNewFolder(rootPath)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 4h4l1 1h7v8H2z" strokeLinejoin="round" />
              <path d="M8 8v4M6 10h4" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ft-icon-btn" title="Refresh" onClick={() => { setChildren({}); loadDir(rootPath); refreshKeyRef.current++ }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3" strokeLinecap="round" />
              <path d="M12 2v3h-3M4 14v-3h3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ft-list">
        {renderItems(rootPath, 0)}
      </div>

      {contextMenu && (
        <div className="ft-context" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.item.isDir && (
            <>
              <div onClick={() => { startNewFile(contextMenu.item.path); setContextMenu(null) }}>＋ New file</div>
              <div onClick={() => { startNewFolder(contextMenu.item.path); setContextMenu(null) }}>＋ New folder</div>
              <div className="ft-sep" />
            </>
          )}
          {!contextMenu.item.isDir && (
            <div onClick={() => { onOpen?.(contextMenu.item.path); setContextMenu(null) }}>Open</div>
          )}
          {contextMenu.item.name !== 'root' && (
            <>
              <div onClick={() => { startRename(contextMenu.item); setContextMenu(null) }}>Rename</div>
              <div className="ft-sep" />
              <div onClick={async () => {
                const ignorePattern = contextMenu.item.isDir
                  ? contextMenu.item.name + '/'
                  : contextMenu.item.name
                const r = await window.nexterm.gitc.gitignoreAdd(rootPath, ignorePattern)
                setContextMenu(null)
                if (!r?.ok) await window.nexterm.confirm({ message: 'Could not update .gitignore', detail: r?.error || '' })
              }}>Add to .gitignore</div>
              <div className="danger" onClick={() => { deleteItem(contextMenu.item); setContextMenu(null) }}>Delete</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
