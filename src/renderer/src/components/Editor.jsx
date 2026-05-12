import { useEffect, useRef, useState, useCallback } from 'react'
// Worker setup MUST be imported before any other Monaco code.
import '../monaco-setup'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
// Register languages not in Monaco's default bundle (Dart, etc.).
import '../monaco-langs'
import { useStore } from '../store'
import FileTree from './FileTree'
import Terminal from './Terminal'

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
  const settings            = useStore(s => s.settings)
  const coder               = settings.coder || {}

  const [fileContents, setFileContents] = useState({})  // path → text
  const [loadError, setLoadError] = useState(null)
  const editorRef = useRef(null)

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
        console.log('[Editor] read result:', r?.ok, r?.binary, r?.text?.length)
        if (cancelled) return
        if (!r) { setLoadError('No response from main process'); return }
        if (!r.ok) { setLoadError(r.error || 'Failed to read file'); return }
        if (r.binary) { setLoadError('Binary file — cannot edit here.'); return }
        setFileContents(c => ({ ...c, [activeFile]: r.text ?? '' }))
      } catch (e) {
        console.error('[Editor] read threw:', e)
        if (!cancelled) setLoadError(String(e?.message || e))
      }
    })()
    return () => { cancelled = true }
  }, [activeFile])

  async function saveActive() {
    if (!activeFile) return
    const text = fileContents[activeFile]
    if (text === undefined) return
    const r = await window.nexterm.project.write(activeFile, text)
    if (r.ok) setFileDirty(tab.id, activeFile, false)
    else alert(r.error || 'Save failed')
  }

  // Save on Ctrl+S; toggle bottom terminal on Ctrl+`
  useEffect(() => {
    if (!active) return
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault(); saveActive()
      }
      // Ctrl+W close current file tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w' && activeFile) {
        e.preventDefault(); closeFileInEditor(tab.id, activeFile)
      }
      // Ctrl+` toggle bottom terminal (key '`' has code "Backquote")
      if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') {
        e.preventDefault(); toggleBottomTerm(tab.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, activeFile, tab.id, fileContents])

  // Drag-resize the bottom terminal
  function startResizeBottom(e) {
    e.preventDefault()
    const startY = e.clientY
    const startH = tab.bottomHeight || 240
    function onMove(ev) {
      const delta = startY - ev.clientY
      setBottomHeight(tab.id, startH + delta)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Auto-save debounce timer (one per editor instance)
  const autoSaveTimerRef = useRef(null)

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

  const coderFontPx    = Math.max(8, Math.min(32, coder.fontSize     ?? 13))
  const treeFontPx     = Math.max(8, Math.min(24, coder.treeFontSize ?? 12))
  return (
    <div
      className="coder-shell"
      style={{
        '--coder-font-size': `${coderFontPx}px`,
        '--coder-tree-font-size': `${treeFontPx}px`
      }}
    >
      <FileTree
        rootPath={tab.projectPath}
        activeFile={activeFile}
        onOpen={(p) => openFileInEditor(tab.id, p)}
      />
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
          </div>
        )}
        <div className="coder-editor" style={{ background: '#1e1e1e' }}>
          {!activeFile && (
            <div className="coder-welcome" style={{ background: 'rgba(0,255,0,0.04)' }}>
              <h2 style={{ color: '#0f0' }}>📁 {tab.name}</h2>
              <p style={{ opacity: 0.7 }}>{tab.projectPath}</p>
              <p style={{ marginTop: 18, opacity: 0.5 }}>Click a file in the sidebar to start editing. Ctrl+S to save.</p>
              <p style={{ marginTop: 18, color: '#888', fontSize: 11 }}>[debug] Editor mounted, no file selected yet.</p>
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
          {activeFile && !loadError && fileContents[activeFile] !== undefined && (
            <Editor
              height="100%"
              theme="nexterm-dark"
              language={detectLanguage(activeFile)}
              value={fileContents[activeFile]}
              onChange={onChange}
              onMount={(ed) => { editorRef.current = ed; ed.focus() }}
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
    </div>
  )
}
