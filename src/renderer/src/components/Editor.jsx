import { useEffect, useRef, useState, useCallback } from 'react'
// Worker setup MUST be imported before any other Monaco code.
import '../monaco-setup'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { marked } from 'marked'
// Register languages not in Monaco's default bundle (Dart, etc.).
import '../monaco-langs'
import { ensureSnippetProvider } from '../monaco-snippets'
import { useStore } from '../store'
import FileTree from './FileTree'
import Terminal from './Terminal'
import QuickOpen from './QuickOpen'
import ProjectSearch from './ProjectSearch'
import ActivityBar from './ActivityBar'
import GitPanel from './GitPanel'
import BlamePanel from './BlamePanel'
import DiffViewer from './DiffViewer'
import InlineConfirm from './InlineConfirm'
import OutlinePanel from './OutlinePanel'
import ExtensionsPanel from './ExtensionsPanel'

// Bind Monaco from the bundle so we don't try to load it from a CDN.
loader.config({ monaco })

// Map ext → Monaco language
function detectLanguage(path) {
  if (!path) return 'plaintext'
  const ext = path.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    dart: 'dart',
    java: 'java', kt: 'kotlin', swift: 'swift',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp', php: 'php', sh: 'shell', bash: 'shell',
    ps1: 'powershell', psm1: 'powershell',
    yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', env: 'shell',
    xml: 'xml', sql: 'sql', dockerfile: 'dockerfile',
    vue: 'html', svelte: 'html', graphql: 'graphql', gql: 'graphql'
  }
  if (path.toLowerCase().endsWith('dockerfile')) return 'dockerfile'
  return map[ext] || 'plaintext'
}

// Normalize a CSS color value into a 6-char hex string (no #). Monaco's theme
// schema rejects 3-char hex and rgb()/named colors, so we have to expand.
function toHex6(value, fallback) {
  if (!value) return fallback
  let v = String(value).trim()
  // rgb(r,g,b) form → convert
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const h = n => Number(n).toString(16).padStart(2, '0')
    return (h(m[1]) + h(m[2]) + h(m[3])).toLowerCase()
  }
  v = v.replace('#', '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map(c => c + c).join('')
  if (/^[0-9a-f]{8}$/.test(v)) v = v.slice(0, 6)
  if (/^[0-9a-f]{6}$/.test(v)) return v
  return fallback
}

// Define a Monaco theme that picks up our CSS variables so the editor matches
// whichever NexTerm theme is active.
function applyTheme() {
  try {
    const style = getComputedStyle(document.documentElement)
    const fg     = toHex6(style.getPropertyValue('--fg'),     'e0e0e0')
    const bg     = toHex6(style.getPropertyValue('--bg'),     '1e1e1e')
    const muted  = toHex6(style.getPropertyValue('--muted'),  '888888')
    const accent = toHex6(style.getPropertyValue('--accent'), '4ec9b0')
    monaco.editor.defineTheme('nexterm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: muted, fontStyle: 'italic' },
        { token: 'keyword', foreground: accent }
      ],
      colors: {
        'editor.background':              '#' + bg,
        'editor.foreground':              '#' + fg,
        'editorLineNumber.foreground':    '#' + muted,
        'editorCursor.foreground':        '#' + accent,
        'editor.selectionBackground':     '#3a3d41',
        'editor.lineHighlightBackground': '#2a2a2a'
      }
    })
  } catch (e) { console.error('[Monaco theme]', e) }
}

export default function CoderEditor({ tab, active }) {
  const setEditorActiveFile = useStore(s => s.setEditorActiveFile)
  const openFileInEditor    = useStore(s => s.openFileInEditor)
  const closeFileInEditor   = useStore(s => s.closeFileInEditor)
  const setFileDirty        = useStore(s => s.setFileDirty)
  const toggleBottomTerm    = useStore(s => s.toggleBottomTerminal)
  const closeBottomTerm     = useStore(s => s.closeBottomTerminal)
  const setBottomHeight     = useStore(s => s.setBottomHeight)
  const setSidebarMode      = useStore(s => s.setSidebarMode)
  const setSidebarWidth     = useStore(s => s.setSidebarWidth)
  const setTreeExpanded     = useStore(s => s.setTreeExpanded)
  const settings            = useStore(s => s.settings)
  const baseCoder           = settings.coder || {}
  // Per-project workspace config loaded from .nexterm/workspace.json (if any)
  const [workspaceCfg, setWorkspaceCfg] = useState(null)
  useEffect(() => {
    let cancelled = false
    window.nexterm.project.loadWorkspaceConfig(tab.projectPath).then(r => {
      if (cancelled) return
      if (r?.ok && r.config) setWorkspaceCfg(r.config)
      else setWorkspaceCfg(null)
    })
    return () => { cancelled = true }
  }, [tab.projectPath])
  // Merge global coder settings with per-project overrides.
  // Project values take precedence for the keys it defines.
  const coder = { ...baseCoder, ...(workspaceCfg?.coder || {}) }
  const sidebarMode         = tab.sidebarMode === undefined ? 'explorer' : tab.sidebarMode

  const [fileContents, setFileContents] = useState({})  // path → text
  const [fileMeta, setFileMeta] = useState({})           // path → { kind: 'image', mime, dataBase64 }
  const [loadError, setLoadError] = useState(null)
  const [mdPreview, setMdPreview] = useState(false)       // toggle markdown preview pane
  const editorRef = useRef(null)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showProjSearch, setShowProjSearch] = useState(false)
  const [showBlame, setShowBlame] = useState(false)
  const [diffSpec, setDiffSpec] = useState(null)
  // External-change reload prompt: { path, newMtime } | null. Triggered when
  // the watched file changes on disk and we have unsaved edits to it.
  const [reloadPrompt, setReloadPrompt] = useState(null)
  // Track mtime of each loaded file so we can detect external changes.
  const fileMtimeRef = useRef({})
  // Goto: when set, jump the editor to {line, col} after the file loads.
  const [pendingGoto, setPendingGoto] = useState(null)

  const activeFile = tab.activeFile
  const openFiles  = tab.openFiles || []

  // Apply theme once (re-applied on theme change via observer in App).
  useEffect(() => { applyTheme() }, [])

  // Re-apply when CSS variables change (theme switch).
  useEffect(() => {
    const obs = new MutationObserver(() => applyTheme())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // Load content when activeFile changes and we don't have it cached.
  useEffect(() => {
    if (!activeFile) return
    if (fileContents[activeFile] !== undefined) return
    let cancelled = false
    console.log('[Editor] reading file:', activeFile)
    ;(async () => {
      setLoadError(null)
      try {
        const r = await window.nexterm.project.read(activeFile)
        if (cancelled) return
        if (!r) { setLoadError('No response from main process'); return }
        if (!r.ok) { setLoadError(r.error || 'Failed to read file'); return }
        if (r.kind === 'image') {
          setFileMeta(m => ({ ...m, [activeFile]: { kind: 'image', mime: r.mime, dataBase64: r.dataBase64 } }))
          setFileContents(c => ({ ...c, [activeFile]: '' }))
          fileMtimeRef.current[activeFile] = r.mtime
          return
        }
        if (r.binary) { setLoadError('Binary file — cannot edit here.'); return }
        setFileContents(c => ({ ...c, [activeFile]: r.text ?? '' }))
        fileMtimeRef.current[activeFile] = r.mtime
      } catch (e) {
        console.error('[Editor] read threw:', e)
        if (!cancelled) setLoadError(String(e?.message || e))
      }
    })()
    return () => { cancelled = true }
  }, [activeFile])

  // Register a Monaco snippet provider for whatever language the active file uses.
  useEffect(() => {
    if (!activeFile) return
    ensureSnippetProvider(detectLanguage(activeFile))
    // Wildcard provider for all-language snippets too — register against
    // common languages once.
    for (const l of ['javascript', 'typescript', 'python', 'markdown', 'plaintext']) ensureSnippetProvider(l)
  }, [activeFile])

  // Watch for external changes to currently-open files. If a file changes
  // on disk after we loaded it:
  //   - If our copy is CLEAN → silently re-read so the editor shows the new content
  //   - If our copy is DIRTY → prompt the user (Keep mine / Reload from disk)
  useEffect(() => {
    const off = window.nexterm.project.onFsEvent(async ({ dir, path }) => {
      if (dir !== tab.projectPath) return
      // Only act on files we have open
      const isOpen = (tab.openFiles || []).some(f => f.path === path)
      if (!isOpen) return
      // Get current mtime; if same as the one we loaded, nothing changed
      const r = await window.nexterm.project.read(path).catch(() => null)
      if (!r?.ok || r.binary) return
      const prevMtime = fileMtimeRef.current[path] || 0
      if (!r.mtime || r.mtime <= prevMtime + 50) return
      const fileEntry = (tab.openFiles || []).find(f => f.path === path)
      const isDirty = !!fileEntry?.dirty
      if (!isDirty) {
        // Clean copy — silently update to the latest disk content
        setFileContents(c => ({ ...c, [path]: r.text ?? '' }))
        fileMtimeRef.current[path] = r.mtime
      } else {
        // Dirty — ask the user. Don't fire twice for the same path.
        if (reloadPrompt?.path === path) return
        setReloadPrompt({ path, newText: r.text ?? '', newMtime: r.mtime })
      }
    })
    return () => off?.()
  }, [tab.projectPath, tab.openFiles, reloadPrompt])

  // Apply pending goto (set when opening a search result) once content is ready.
  useEffect(() => {
    if (!pendingGoto || !activeFile) return
    if (fileContents[activeFile] === undefined) return
    const ed = editorRef.current
    if (!ed) return
    const { line, col } = pendingGoto
    try {
      ed.revealLineInCenter(line || 1)
      ed.setPosition({ lineNumber: line || 1, column: (col || 0) + 1 })
      ed.focus()
    } catch {}
    setPendingGoto(null)
  }, [pendingGoto, activeFile, fileContents])

  async function saveActive() {
    if (!activeFile) return
    let text = fileContents[activeFile]
    if (text === undefined) return
    // Trim trailing whitespace if enabled
    if (coder.trimTrailingWhitespace === true) {
      text = text.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
      setFileContents(c => ({ ...c, [activeFile]: text }))
    }
    // Format on save (Monaco's per-language formatter)
    if (coder.formatOnSave === true && editorRef.current) {
      try {
        await editorRef.current.getAction('editor.action.formatDocument')?.run()
        // Re-read after format
        text = editorRef.current.getValue()
        setFileContents(c => ({ ...c, [activeFile]: text }))
      } catch {}
    }
    const r = await window.nexterm.project.write(activeFile, text)
    if (r.ok) setFileDirty(tab.id, activeFile, false)
    else alert(r.error || 'Save failed')
  }

  // All editor-scope shortcuts. Active only when this editor tab is current.
  useEffect(() => {
    if (!active) return
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey
      // Save current file
      if (ctrl && e.key.toLowerCase() === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault(); saveActive(); return
      }
      // Close current file tab
      if (ctrl && e.key.toLowerCase() === 'w' && activeFile) {
        e.preventDefault(); closeFileWithConfirm(activeFile); return
      }
      // Toggle bottom terminal
      if (ctrl && e.code === 'Backquote') {
        e.preventDefault(); toggleBottomTerm(tab.id); return
      }
      // Quick Open (Ctrl+P, not Ctrl+Shift+P)
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault(); setShowQuickOpen(true); return
      }
      // Find in Project
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault(); setShowProjSearch(true); return
      }
      // Find in current file (Monaco built-in)
      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault(); editorRef.current?.trigger('keyboard', 'actions.find', null); return
      }
      // Replace in current file
      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault(); editorRef.current?.trigger('keyboard', 'editor.action.startFindReplaceAction', null); return
      }
      // Go to line
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault(); editorRef.current?.trigger('keyboard', 'editor.action.gotoLine', null); return
      }
      // Go to symbol in current file
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault(); editorRef.current?.trigger('keyboard', 'editor.action.quickOutline', null); return
      }
      // Format Document (Shift+Alt+F)
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault(); editorRef.current?.trigger('keyboard', 'editor.action.formatDocument', null); return
      }
      // Toggle Explorer panel (Ctrl+Shift+E) — read sidebarMode LIVE from
      // the store to avoid stale-closure bugs where the value seen here
      // doesn't match what's actually rendered.
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        const live = useStore.getState().tabs.find(t => t.id === tab.id)?.sidebarMode
        setSidebarMode(tab.id, live === 'explorer' ? null : 'explorer')
        return
      }
      // Toggle Source Control panel (Ctrl+Shift+G)
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        const live = useStore.getState().tabs.find(t => t.id === tab.id)?.sidebarMode
        setSidebarMode(tab.id, live === 'git' ? null : 'git')
        return
      }
      // Toggle Outline panel (Ctrl+Shift+L)
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        const live = useStore.getState().tabs.find(t => t.id === tab.id)?.sidebarMode
        setSidebarMode(tab.id, live === 'outline' ? null : 'outline')
        return
      }
      // Toggle word wrap (Alt+Z)
      if (e.altKey && !ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useStore.getState().updateSettings({ coder: { ...(useStore.getState().settings.coder || {}), wordWrap: !(coder.wordWrap === true) } })
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, activeFile, tab.id, fileContents, coder.wordWrap])

  // Drag-resize the bottom terminal
  // Drag-resize the left sidebar (file tree / git panel) horizontally
  function startResizeSidebar(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = tab.sidebarWidth || 260
    const prevUserSelect = document.body.style.userSelect
    const prevCursor     = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'ew-resize'
    function onMove(ev) {
      setSidebarWidth(tab.id, startW + (ev.clientX - startX))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor     = prevCursor
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startResizeBottom(e) {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = tab.bottomHeight || 240
    const prevUserSelect = document.body.style.userSelect
    const prevCursor     = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'ns-resize'
    function onMove(ev) {
      const delta = startY - ev.clientY
      setBottomHeight(tab.id, startH + delta)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor     = prevCursor
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Auto-save debounce timer (one per editor instance)
  const autoSaveTimerRef = useRef(null)
  // Monaco gutter decorations representing git status (added/modified/deleted)
  const gitDecorRef = useRef([])

  // Refresh the gutter diff markers for the active file. Called after the
  // file loads, after save, and on a debounced edit timer.
  async function refreshGitGutter() {
    if (!activeFile) return
    if (!editorRef.current) return
    try {
      const r = await window.nexterm.gitc.fileMarkers(tab.projectPath, activeFile)
      if (!r?.ok) return
      const newDecors = []
      for (const ln of r.added || [])    newDecors.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-add' } })
      for (const ln of r.modified || []) newDecors.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-mod' } })
      for (const ln of r.removedAt || []) newDecors.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-del' } })
      gitDecorRef.current = editorRef.current.deltaDecorations(gitDecorRef.current, newDecors)
    } catch {}
  }

  // Re-run gutter computation when the active file changes or its content does.
  useEffect(() => {
    if (!activeFile) return
    if (fileContents[activeFile] === undefined) return
    refreshGitGutter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, fileContents[activeFile]])

  function onChange(val) {
    if (!activeFile) return
    setFileContents(c => ({ ...c, [activeFile]: val ?? '' }))
    const wasDirty = openFiles.find(f => f.path === activeFile)?.dirty
    if (!wasDirty) setFileDirty(tab.id, activeFile, true)
    // Auto-save if enabled — debounced
    if (coder.autoSave === true) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      const delay = Math.max(200, Math.min(10000, coder.autoSaveDelayMs ?? 1500))
      autoSaveTimerRef.current = setTimeout(() => { saveActive() }, delay)
    }
  }

  function fileLabel(path) {
    return path.split(/[\\/]/).pop()
  }

  function closeFileWithConfirm(path) {
    const f = openFiles.find(x => x.path === path)
    if (f?.dirty && coder.confirmOnClose !== false) {
      if (!confirm(`${fileLabel(path)} has unsaved changes. Close anyway?`)) return
    }
    closeFileInEditor(tab.id, path)
  }

  // Compute breadcrumb segments relative to project root.
  function breadcrumbSegments() {
    if (!activeFile) return []
    const proj = tab.projectPath.replace(/[\\/]$/, '')
    let rel = activeFile
    if (activeFile.startsWith(proj)) rel = activeFile.slice(proj.length).replace(/^[\\/]/, '')
    return rel.split(/[\\/]/).filter(Boolean)
  }

  const coderFontPx    = Math.max(8, Math.min(32, coder.fontSize     ?? 13))
  const treeFontPx     = Math.max(8, Math.min(24, coder.treeFontSize ?? 12))
  return (
    <div
      className="coder-shell"
      style={{
        '--coder-font-size': `${coderFontPx}px`,
        '--coder-tree-font-size': `${treeFontPx}px`
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => {
        e.preventDefault()
        const files = [...(e.dataTransfer?.files || [])]
        for (const f of files) {
          if (f.path) openFileInEditor(tab.id, f.path)
        }
      }}
    >
      <ActivityBar
        mode={sidebarMode}
        onChange={(m) => setSidebarMode(tab.id, m)}
      />
      {sidebarMode && (
        <div className="coder-sidebar" style={{ width: tab.sidebarWidth || 260 }}>
          {sidebarMode === 'explorer' && (
            <FileTree
              rootPath={tab.projectPath}
              activeFile={activeFile}
              onOpen={(p) => openFileInEditor(tab.id, p)}
              revealRequest={tab.revealRequest || 0}
              persistedExpanded={tab.treeExpanded}
              onExpandedChange={(exp) => setTreeExpanded(tab.id, exp)}
            />
          )}
          {sidebarMode === 'git' && (
            <GitPanel
              projectPath={tab.projectPath}
              onOpenFile={(p) => openFileInEditor(tab.id, p)}
            />
          )}
          {sidebarMode === 'outline' && (
            <OutlinePanel activeFile={activeFile} editorRef={editorRef} />
          )}
          {sidebarMode === 'extensions' && (
            <ExtensionsPanel />
          )}
          <div
            className="coder-sidebar-resize"
            onMouseDown={startResizeSidebar}
            title="Drag to resize"
          />
        </div>
      )}
      <div className="coder-main">
        {openFiles.length > 0 && (
          <div className="coder-tabs">
            {openFiles.map(f => (
              <div
                key={f.path}
                className={`coder-tab ${f.path === activeFile ? 'active' : ''}`}
                onClick={() => setEditorActiveFile(tab.id, f.path)}
                title={f.path}
              >
                <span className="coder-tab-name">{fileLabel(f.path)}{f.dirty ? ' •' : ''}</span>
                <button
                  className="coder-tab-close"
                  onClick={(e) => { e.stopPropagation(); closeFileWithConfirm(f.path) }}
                >×</button>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            {activeFile && (
              <button
                className={`coder-md-toggle ${showBlame ? 'on' : ''}`}
                onClick={() => setShowBlame(v => !v)}
                title="Toggle git blame"
              >⎇b</button>
            )}
            {activeFile && /\.md$/i.test(activeFile) && (
              <button
                className={`coder-md-toggle ${mdPreview ? 'on' : ''}`}
                onClick={() => setMdPreview(v => !v)}
                title="Toggle Markdown preview"
              >👁</button>
            )}
          </div>
        )}
        <div className="coder-editor" style={{ background: '#1e1e1e' }}>
          {!activeFile && (
            <div className="coder-welcome">
              <h2>📁 {tab.name}</h2>
              <p style={{ opacity: 0.7, marginBottom: 22 }}>{tab.projectPath}</p>
              <div className="cw-shortcuts">
                <div className="cw-shortcut"><kbd>Ctrl+P</kbd> Quick Open file</div>
                <div className="cw-shortcut"><kbd>Ctrl+Shift+F</kbd> Find in Project</div>
                <div className="cw-shortcut"><kbd>Ctrl+Shift+G</kbd> Source Control</div>
                <div className="cw-shortcut"><kbd>Ctrl+`</kbd> Bottom Terminal</div>
              </div>
            </div>
          )}
          {activeFile && loadError && (
            <div className="coder-welcome" style={{ background: 'rgba(255,0,0,0.06)' }}>
              <h3 style={{ color: '#ef4444' }}>Read failed</h3>
              <p style={{ color: '#ef4444' }}>{loadError}</p>
              <p style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>File: {activeFile}</p>
            </div>
          )}
          {activeFile && !loadError && fileContents[activeFile] === undefined && (
            <div className="coder-welcome" style={{ background: 'rgba(255,255,0,0.06)' }}>
              <h3 style={{ color: '#ff0' }}>Loading…</h3>
              <p style={{ opacity: 0.7 }}>{activeFile.split(/[\\/]/).pop()}</p>
              <p style={{ marginTop: 8, fontSize: 11, opacity: 0.4 }}>If this stays forever, open DevTools (Ctrl+Shift+I) → Console tab.</p>
            </div>
          )}
          {activeFile && !loadError && fileMeta[activeFile]?.kind === 'image' && (
            <div className="coder-image-preview">
              <img
                src={`data:${fileMeta[activeFile].mime};base64,${fileMeta[activeFile].dataBase64}`}
                alt={fileLabel(activeFile)}
              />
              <div className="coder-image-meta">{fileLabel(activeFile)}</div>
            </div>
          )}
          {activeFile && !loadError && !fileMeta[activeFile] && fileContents[activeFile] !== undefined && (
            <div className={`coder-edit-area ${mdPreview && /\.md$/i.test(activeFile) ? 'split' : ''}`}>
              <div className="coder-edit-pane">
            <Editor
              height="100%"
              theme="nexterm-dark"
              language={detectLanguage(activeFile)}
              value={fileContents[activeFile]}
              onChange={onChange}
              onMount={(ed) => {
                editorRef.current = ed
                ed.focus()
                if (pendingGoto) {
                  const { line, col } = pendingGoto
                  ed.revealLineInCenter(line || 1)
                  ed.setPosition({ lineNumber: line || 1, column: (col || 0) + 1 })
                  setPendingGoto(null)
                }
              }}
              options={{
                fontFamily: 'JetBrains Mono, Consolas, monospace',
                fontSize:    coder.fontSize     ?? 13,
                minimap:     { enabled: coder.showMinimap !== false, scale: 1 },
                lineNumbers: coder.lineNumbers !== false ? 'on' : 'off',
                tabSize:     coder.tabSize      ?? 2,
                insertSpaces: coder.insertSpaces !== false,
                wordWrap:    coder.wordWrap === true ? 'on' : 'off',
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                renderLineHighlight: 'line',
                scrollBeyondLastLine: false
              }}
            />
              </div>
              {mdPreview && /\.md$/i.test(activeFile) && (
                <div
                  className="coder-md-preview"
                  dangerouslySetInnerHTML={{ __html: marked.parse(fileContents[activeFile] || '') }}
                />
              )}
              {showBlame && activeFile && (
                <BlamePanel
                  projectPath={tab.projectPath}
                  filePath={activeFile}
                  onClose={() => setShowBlame(false)}
                  onShowCommit={(hash, subject) => {
                    setDiffSpec({
                      title: `${hash.slice(0,7)} · ${subject || ''}`,
                      loader: () => window.nexterm.gitc.commitDiff(tab.projectPath, hash)
                    })
                  }}
                />
              )}
            </div>
          )}
        </div>

        {tab.bottomVisible && tab.bottomPane && (
          <>
            <div className="coder-bottom-handle" onMouseDown={startResizeBottom} />
            <div
              className="coder-bottom-sheet"
              style={{ height: tab.bottomHeight || 240 }}
            >
              <div className="coder-bottom-toolbar">
                <span className="coder-bottom-title">Terminal · {tab.projectPath.split(/[\\/]/).pop()}</span>
                <button
                  className="coder-bottom-close"
                  onClick={() => closeBottomTerm(tab.id)}
                  title="Close terminal panel"
                >×</button>
              </div>
              <div className="coder-bottom-term">
                <Terminal
                  pane={tab.bottomPane}
                  tabId={tab.id}
                  active={active}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {showQuickOpen && (
        <QuickOpen
          projectPath={tab.projectPath}
          onPick={(path) => openFileInEditor(tab.id, path)}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
      {showProjSearch && (
        <ProjectSearch
          projectPath={tab.projectPath}
          onOpenLocation={(path, line, col) => {
            openFileInEditor(tab.id, path)
            setPendingGoto({ line, col })
          }}
          onClose={() => setShowProjSearch(false)}
        />
      )}
      {diffSpec && (
        <DiffViewer
          title={diffSpec.title}
          loader={diffSpec.loader}
          onClose={() => setDiffSpec(null)}
        />
      )}

      {reloadPrompt && (
        <InlineConfirm
          message={`"${reloadPrompt.path.split(/[\\/]/).pop()}" was changed on disk`}
          detail="You have unsaved edits in this file. Reload the disk version (your edits will be lost) or keep your edits?"
          confirmLabel="Reload from disk"
          cancelLabel="Keep my edits"
          danger
          onConfirm={() => {
            setFileContents(c => ({ ...c, [reloadPrompt.path]: reloadPrompt.newText }))
            setFileDirty(tab.id, reloadPrompt.path, false)
            fileMtimeRef.current[reloadPrompt.path] = reloadPrompt.newMtime
            setReloadPrompt(null)
          }}
          onCancel={() => {
            // User keeps their edits — bump mtime so we don't keep prompting.
            fileMtimeRef.current[reloadPrompt.path] = reloadPrompt.newMtime
            setReloadPrompt(null)
          }}
        />
      )}
    </div>
  )
}
