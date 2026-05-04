import { useEffect, useState } from 'react'
import { useStore } from './store'
import { getTheme } from './themes'
import { matchKey, getKey } from './shortcuts'

function createWorkspaceTab(t) {
  const pid = `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const tid = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return {
    id: tid,
    name: t.name,
    root: { id: pid, kind: 'leaf', shell: t.shell || null, cwd: t.cwd || null, args: null, label: null },
    activePane: pid,
    pinned: false, color: null, broadcast: false
  }
}

// Serialize a pane tree, baking in each leaf's last known CWD so it respawns there.
function stripPane(pane, cwds) {
  if (!pane) return pane
  if (pane.kind === 'leaf') {
    return {
      kind: 'leaf', id: pane.id,
      shell: pane.shell, args: pane.args, label: pane.label,
      scratch: !!pane.scratch,
      cwd: cwds[pane.id] || pane.cwd || null
    }
  }
  return {
    kind: 'split', id: pane.id, dir: pane.dir, ratio: pane.ratio,
    a: stripPane(pane.a, cwds), b: stripPane(pane.b, cwds)
  }
}
import TitleBar from './components/TitleBar'
import TabBar from './components/TabBar'
import PaneSplitter from './components/PaneSplitter'
import Settings from './components/Settings'
import CommandPalette from './components/CommandPalette'
import HistoryPanel from './components/HistoryPanel'
import ProfilesPanel from './components/ProfilesPanel'
import StatusBar from './components/StatusBar'
import SnippetPicker from './components/SnippetPicker'
import SftpPanel from './components/SftpPanel'
import FindAllPanel from './components/FindAllPanel'

export default function App() {
  const { tabs, activeId, settings, setSettings, addTab, removeTab, setActive,
          splitActivePane, closePane, setTabs, cwds } = useStore()

  const [showSettings, setShowSettings] = useState(false)
  const [showPalette,  setShowPalette]  = useState(false)
  const [showHistory,  setShowHistory]  = useState(false)
  const [showProfiles, setShowProfiles] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [showSftp,     setShowSftp]     = useState(false)
  const [showFindAll,  setShowFindAll]  = useState(false)
  const profiles = useStore(s => s.profiles)
  const setProfiles = useStore(s => s.setProfiles)

  // Toggle the maximized class so CSS can drop the rounded edge / shadow padding
  useEffect(() => {
    const off = window.nexterm.win.onMaximizeChange((isMax) => {
      document.body.classList.toggle('win-maximized', isMax)
    })
    return off
  }, [])


  useEffect(() => {
    (async () => {
      const s = await window.nexterm.settings.get()
      if (s) setSettings(s)

      // Load saved SSH profiles into the store (used by SFTP panel)
      try {
        const list = await window.nexterm.profile.list()
        setProfiles(list || [])
      } catch {}

      // Apply quake mode setting (registers global shortcut)
      if (s?.quakeMode) {
        try {
          await window.nexterm.quake.apply({
            enabled: true,
            hotkey: s.quakeHotkey || 'Ctrl+Shift+Q',
            heightPct: s.quakeHeight ?? 50
          })
        } catch {}
      }

      // If launched with a directory arg (Explorer "Open NexTerm here"),
      // make the first tab spawn there. Skip session-restore when given a dir.
      let initialCwd = null
      try { initialCwd = await window.nexterm.app.initialCwd() } catch {}
      if (initialCwd) {
        // If the folder has a .nexterm.yml workspace file, load all its tabs.
        try {
          const ws = await window.nexterm.workspace.load(initialCwd)
          if (ws?.ok && ws.tabs?.length) {
            const newTabs = ws.tabs.map(t => {
              const tab = createWorkspaceTab(t)
              return tab
            })
            useStore.setState({ tabs: newTabs, activeId: newTabs[0].id })
            // Send workspace commands after PTY mounts
            setTimeout(() => {
              ws.tabs.forEach((t, i) => {
                if (t.command) {
                  const paneId = newTabs[i].activePane
                  window.nexterm.pty.write(paneId, t.command + '\r')
                }
              })
            }, 800)
            return
          }
        } catch {}

        const tabs = useStore.getState().tabs
        if (tabs.length === 1 && tabs[0].root.kind === 'leaf' && !tabs[0].root.cwd) {
          useStore.setState({
            tabs: [{
              ...tabs[0],
              name: initialCwd.split(/[\\/]/).filter(Boolean).pop() || tabs[0].name,
              root: { ...tabs[0].root, cwd: initialCwd }
            }]
          })
          return
        }
      }

      // Restore last session if enabled
      const session = await window.nexterm.session.get()
      if (session?.tabs?.length) {
        // Strip transient fields, regen pane IDs so PTYs get fresh ones
        const refresh = (pane) => {
          if (!pane) return pane
          if (pane.kind === 'leaf') return { ...pane, id: `pane-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }
          return { ...pane, id: `split-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
                   a: refresh(pane.a), b: refresh(pane.b) }
        }
        const newTabs = session.tabs.map(t => {
          const root = refresh(t.root)
          return {
            id: `tab-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            name: t.name,
            root,
            activePane: (function findFirst(p){ return p.kind==='leaf'?p.id:findFirst(p.a) })(root),
            pinned: !!t.pinned,
            color:  t.color || null,
            broadcast: false
          }
        })
        setTabs(newTabs, newTabs[0].id)
      }
    })()
  }, [])

  // Persist current session whenever tabs change
  useEffect(() => {
    if (settings.restoreSession === false) return
    const snapshot = {
      tabs: tabs.map(t => ({
        name: t.name,
        root: stripPane(t.root, cwds),
        activePane: t.activePane,
        pinned: !!t.pinned,
        color:  t.color || null
      })),
      activeId
    }
    const handle = setTimeout(() => {
      window.nexterm.session.save(snapshot)
    }, 600)
    return () => clearTimeout(handle)
  }, [tabs, activeId, cwds, settings.restoreSession])

  // Apply CSS theme variables
  useEffect(() => {
    const t = getTheme(settings.theme)
    const root = document.documentElement.style
    root.setProperty('--bg',      t.bg)
    root.setProperty('--surface', t.surface)
    root.setProperty('--border',  t.border)
    root.setProperty('--accent',  t.accent)
    root.setProperty('--fg',      t.xterm.foreground)
    root.setProperty('--bg-image', settings.backgroundImage ? `url("${settings.backgroundImage}")` : 'none')
    root.setProperty('--bg-dim',   String(settings.backgroundImageDim ?? 0.45))
    root.setProperty('--bg-overlay-display', settings.backgroundImage ? 'block' : 'none')

    // When ANY transparency effect is on (image or OS blur), make surfaces translucent
    // so the effect can actually show through. Otherwise keep opaque.
    const hasEffect = !!settings.backgroundImage ||
                      (settings.windowBlur && settings.windowBlur !== 'none')
    document.body.classList.toggle('bg-effect', hasEffect)
    // Per-color palette (used by icons + NEXTERM gradient)
    const x = t.xterm
    root.setProperty('--c-red',     x.red)
    root.setProperty('--c-green',   x.green)
    root.setProperty('--c-yellow',  x.yellow)
    root.setProperty('--c-blue',    x.blue)
    root.setProperty('--c-magenta', x.magenta)
    root.setProperty('--c-cyan',    x.cyan)
    root.setProperty('--c-bred',     x.brightRed)
    root.setProperty('--c-bgreen',   x.brightGreen)
    root.setProperty('--c-byellow',  x.brightYellow)
    root.setProperty('--c-bblue',    x.brightBlue)
    root.setProperty('--c-bmagenta', x.brightMagenta)
    root.setProperty('--c-bcyan',    x.brightCyan)
  }, [settings.theme, settings.windowBlur,
       settings.backgroundImage, settings.backgroundImageDim])

  // Global shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return
      if (e.target.tagName === 'TEXTAREA' &&
          !e.target.classList.contains('xterm-helper-textarea')) return

      if (e.key === 'Escape') {
        if (showPalette)  { setShowPalette(false);  return }
        if (showSettings) { setShowSettings(false); return }
        if (showHistory)  { setShowHistory(false);  return }
        if (showProfiles) { setShowProfiles(false); return }
        if (showSnippets) { setShowSnippets(false); return }
      }

      // Read all shortcuts from settings (with fallback to defaults)
      const shortcuts = {
        newTab:            getKey(settings, 'newTab'),
        closePane:         getKey(settings, 'closePane'),
        splitRow:          getKey(settings, 'splitRow'),
        splitCol:          getKey(settings, 'splitCol'),
        palette:           getKey(settings, 'palette'),
        profiles:          getKey(settings, 'profiles'),
        history:           getKey(settings, 'history'),
        settings:          getKey(settings, 'settings'),
        nextTab:           getKey(settings, 'nextTab'),
        prevTab:           getKey(settings, 'prevTab'),
        toggleAlwaysOnTop: getKey(settings, 'toggleAlwaysOnTop')
      }

      if (matchKey(e, shortcuts.toggleAlwaysOnTop)) {
        e.preventDefault()
        const next = !(settings.alwaysOnTop === true)
        useStore.getState().updateSettings({ alwaysOnTop: next })
        window.nexterm.win.setAlwaysOnTop(next)
        return
      }

      if (matchKey(e, getKey(settings, 'snippets'))) { e.preventDefault(); setShowSnippets(s => !s); return }
      if (matchKey(e, getKey(settings, 'sftp')))     { e.preventDefault(); setShowSftp(s => !s); return }
      if (matchKey(e, getKey(settings, 'findAll'))) { e.preventDefault(); setShowFindAll(s => !s); return }
      if (matchKey(e, shortcuts.palette))   { e.preventDefault(); setShowPalette(s => !s); return }
      if (matchKey(e, shortcuts.newTab))    { e.preventDefault(); addTab(); return }
      if (matchKey(e, shortcuts.closePane)) { e.preventDefault(); closePane(); return }
      if (matchKey(e, shortcuts.splitRow))  { e.preventDefault(); splitActivePane('row'); return }
      if (matchKey(e, shortcuts.splitCol))  { e.preventDefault(); splitActivePane('col'); return }
      if (matchKey(e, shortcuts.profiles))  { e.preventDefault(); setShowProfiles(s => !s); return }
      if (matchKey(e, shortcuts.settings))  { e.preventDefault(); setShowSettings(s => !s); return }
      if (matchKey(e, shortcuts.history))   { e.preventDefault(); setShowHistory(s => !s); return }

      if (matchKey(e, shortcuts.nextTab)) {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeId)
        setActive(tabs[(idx + 1) % tabs.length]?.id)
        return
      }
      if (matchKey(e, shortcuts.prevTab)) {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeId)
        setActive(tabs[(idx - 1 + tabs.length) % tabs.length]?.id)
        return
      }

      // Ctrl+1 … Ctrl+9 — jump to specific tab number
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey
          && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < tabs.length) {
          e.preventDefault()
          setActive(tabs[idx].id)
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activeId, showPalette, showSettings, showHistory, showProfiles])

  const bgImg = settings.backgroundImage
  const dim   = settings.backgroundImageDim ?? 0.45

  return (
    <div className="app-shell">
      {/* Real background image layer (more reliable than CSS pseudo-elements) */}
      {bgImg && (
        <>
          <div
            className="real-bg-layer"
            style={{
              backgroundImage: `url("${bgImg}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          />
          <div
            className="real-bg-dim"
            style={{ background: `rgba(0,0,0,${dim})` }}
          />
        </>
      )}

      <TitleBar
        onSettings={() => setShowSettings(s => !s)}
        onHistory={()  => setShowHistory(s => !s)}
        onPalette={()  => setShowPalette(s => !s)}
        onProfiles={() => setShowProfiles(s => !s)}
      />
      <TabBar />

      <div className="terminal-area">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab-content ${tab.id === activeId ? '' : 'hidden'}`}
          >
            <PaneSplitter
              pane={tab.root}
              tabId={tab.id}
              tabActive={tab.id === activeId}
              activePaneId={tab.activePane}
            />
          </div>
        ))}
      </div>

      <StatusBar />

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {showPalette && (
        <CommandPalette
          onClose={()    => setShowPalette(false)}
          onSettings={() => { setShowPalette(false); setShowSettings(true) }}
          onHistory={()  => { setShowPalette(false); setShowHistory(true) }}
          onProfiles={() => { setShowPalette(false); setShowProfiles(true) }}
        />
      )}

      <div className="app-border" />

      {showHistory  && <HistoryPanel  onClose={() => setShowHistory(false)} />}
      {showProfiles && <ProfilesPanel onClose={() => setShowProfiles(false)} />}
      {showSnippets && (
        <SnippetPicker
          onClose={() => setShowSnippets(false)}
          onInsert={(text) => {
            const tab = tabs.find(t => t.id === activeId)
            if (tab?.activePane) window.nexterm.pty.write(tab.activePane, text)
          }}
        />
      )}
      {showFindAll && <FindAllPanel onClose={() => setShowFindAll(false)} />}
      {showSftp && (() => {
        const tab = tabs.find(t => t.id === activeId)
        const findLeaf = (p, id) => !p ? null : p.kind === 'leaf' ? (p.id === id ? p : null) : findLeaf(p.a, id) || findLeaf(p.b, id)
        const leaf = tab && findLeaf(tab.root, tab.activePane)
        const pid  = leaf?.profileId
        const profile = pid && profiles.find(p => p.id === pid)
        if (!profile) {
          return (
            <div className="sftp-panel">
              <div className="sftp-header">
                <span>SFTP</span>
                <button className="icon-btn" onClick={() => setShowSftp(false)} style={{ fontSize: 18 }}>×</button>
              </div>
              <div className="sftp-empty">
                Open an SSH profile tab first. SFTP attaches to that profile's host.
              </div>
            </div>
          )
        }
        return <SftpPanel profile={profile} onClose={() => setShowSftp(false)} />
      })()}
    </div>
  )
}
