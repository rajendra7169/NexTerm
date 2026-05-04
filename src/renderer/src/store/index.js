import { create } from 'zustand'

const DEFAULT_SETTINGS = {
  theme: 'tokyonight',
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  defaultShell: 'powershell.exe',
  saveHistory: true,
  maxHistoryItems: 10000,
  suggestions: true,
  windowButtons: 'right',  // 'left' | 'right'
  buttonStyle: 'windows',   // 'windows' | 'mac' | 'minimal' | …
  showBanner: true,
  bannerLogo: 'nexterm',     // 'nexterm' | 'windows' | 'tux' | 'cat' | 'custom' | 'none'
  customLogoText: 'RJ',
  customLogoSubtitle: '',

  // Startup settings
  defaultLaunch: { type: 'shell', value: 'powershell.exe', label: 'PowerShell' },
  launchOnStartup: false,
  launchSizePreset: 'medium',  // 'small' | 'medium' | 'large' | 'max' | 'custom'
  launchWidth: 1280,
  launchHeight: 800,

  // Window/transparency
  terminalOpacity: 1.0,        // 0.3 .. 1.0
  alwaysOnTop: false,
  runInBackground: false,
  windowBlur: 'none',          // 'none' | 'mica' | 'acrylic' | 'tabbed'
  backgroundImage: null,        // data URL of an uploaded image
  backgroundImageDim: 0.45,     // 0..1 — darkness overlay over the image

  // Custom theme color overrides — null means use the active theme's value
  customColors: {
    background: null,
    foreground: null,
    cursor: null,
    cursorAccent: null,           // text color INSIDE block cursor (typing)
    selectionBackground: null
  },

  // Web search action
  searchUrl: 'https://www.google.com/search?q=',

  // Warnings
  warnMultiTab: true,
  warnPasteSize: true,
  pasteWarnLimit: 5120,         // bytes (5 KiB)

  // User-overridable shortcuts. Empty = use defaults.
  shortcuts: {},

  // Aliases — { global: [{name, command}], projects: [{id, name, path, aliases:[]}] }
  aliases: { global: [], projects: [] },

  // Directory bookmarks — `goto <name>` jumps to path
  bookmarks: [],

  // Secrets injected as env vars at PTY spawn (when injectSecrets is true)
  injectSecrets: false,

  // Title-bar app-icons (⚡⏱⌘⚙)
  appIconsStyle:    '3d',     // '3d' | 'flat' | 'outline' | 'unicode'
  appIconsPosition: 'right',  // 'right' | 'center'

  // Session restore on launch
  restoreSession: true,

  // Long-command notifications
  notifyLongCommands: true,
  notifyThresholdMs: 30000,
  notifySound: true,

  // Quake-mode (slide-from-top global hotkey)
  quakeMode: false,
  quakeHotkey: 'Ctrl+Shift+Q',
  quakeHeight: 50,           // % of screen

  // Saved workspaces — { [name]: { tabs: [...] } }
  workspaces: {},

  // Open NexTerm here (Explorer right-click) — managed via reg.exe
  explorerContextMenu: false,

  // Saved command snippets — { id, name, command, description }
  snippets: [],

  // Visual flex
  inlineImages:    true,    // Sixel + iTerm2 protocol rendering
  linkHoverCards:  true,    // Tiny preview when hovering URLs
  miniMap:         false,   // Right-edge minimap of scrollback
  animatedBanner:  false,   // Type-in banner with neon glow

  // Productivity
  commandTimer:    true,    // [1.2s] before each prompt
  scratchpads:     {}       // { paneId: text }
}

let counter = 1
const newPaneId  = () => `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const newTabId   = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const newSplitId = () => `split-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`

function createLeaf({ shell = null, cwd = null, args = null, label = null, autoReconnect = false, profileId = null, scratch = false } = {}) {
  return { id: newPaneId(), kind: 'leaf', shell, cwd, args, label, autoReconnect, profileId, scratch }
}

function createTab(opts = {}) {
  const leaf = createLeaf(opts)
  return {
    id: newTabId(),
    name: opts.name || `Terminal ${counter++}`,
    root: leaf,
    activePane: leaf.id,
    pinned: !!opts.pinned,
    color:  opts.color  || null,    // accent color hex
    broadcast: !!opts.broadcast     // mirror input to all panes in this tab
  }
}

// ─── Pane tree helpers ────────────────────────────────────────────────────────
export function findPane(root, id) {
  if (!root) return null
  if (root.id === id) return root
  if (root.kind === 'split') return findPane(root.a, id) || findPane(root.b, id)
  return null
}

export function findFirstLeaf(root) {
  if (!root) return null
  if (root.kind === 'leaf') return root
  return findFirstLeaf(root.a)
}

export function findAllLeaves(root) {
  if (!root) return []
  if (root.kind === 'leaf') return [root]
  return [...findAllLeaves(root.a), ...findAllLeaves(root.b)]
}

function mapPane(root, id, fn) {
  if (!root) return root
  if (root.id === id) return fn(root)
  if (root.kind === 'split') {
    const newA = mapPane(root.a, id, fn)
    const newB = mapPane(root.b, id, fn)
    if (newA === root.a && newB === root.b) return root
    return { ...root, a: newA, b: newB }
  }
  return root
}

function removePaneFromTree(root, id) {
  if (!root) return null
  if (root.id === id) return null
  if (root.kind === 'split') {
    const newA = removePaneFromTree(root.a, id)
    const newB = removePaneFromTree(root.b, id)
    if (newA === null) return newB
    if (newB === null) return newA
    if (newA === root.a && newB === root.b) return root
    return { ...root, a: newA, b: newB }
  }
  return root
}

function splitLeaf(root, paneId, dir) {
  return mapPane(root, paneId, leaf => {
    if (leaf.kind !== 'leaf') return leaf
    const sibling = createLeaf({ shell: leaf.shell, cwd: leaf.cwd })
    return {
      id: newSplitId(),
      kind: 'split',
      dir,           // 'row' (side-by-side) | 'col' (top-bottom)
      a: leaf,
      b: sibling,
      ratio: 0.5
    }
  })
}

// ─── Initial state ────────────────────────────────────────────────────────────
const firstTab = createTab()

export const useStore = create((set, get) => ({
  tabs: [firstTab],
  activeId: firstTab.id,
  settings: DEFAULT_SETTINGS,
  profiles: [],
  cwds: {},     // { paneId: '/current/working/dir' }

  setCwd: (paneId, dir) =>
    set(s => ({ cwds: { ...s.cwds, [paneId]: dir } })),

  // Replace the entire tabs state — used when restoring a session
  setTabs: (tabs, activeId) =>
    set({ tabs, activeId: activeId || (tabs[0]?.id ?? null) }),

  // ── Tabs ──
  addTab: (overrides) => {
    // If no explicit overrides AND a defaultLaunch is set, use it
    let opts = overrides
    if (!overrides) {
      const dl = get().settings.defaultLaunch
      if (dl && dl.type === 'profile') {
        opts = { name: dl.label, shell: 'ssh.exe', args: dl.args }
      } else if (dl && dl.type === 'shell') {
        opts = { name: dl.label, shell: dl.value }
      }
    }
    const tab = createTab(opts)
    set(s => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab
  },

  removeTab: (id) => {
    set(s => {
      const idx = s.tabs.findIndex(t => t.id === id)
      const tabs = s.tabs.filter(t => t.id !== id)
      if (tabs.length === 0) {
        const tab = createTab()
        return { tabs: [tab], activeId: tab.id }
      }
      const activeId = s.activeId === id
        ? tabs[Math.max(0, idx - 1)]?.id ?? tabs[0].id
        : s.activeId
      return { tabs, activeId }
    })
  },

  setActive: (id) => set({ activeId: id }),

  renameTab: (id, name) =>
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t) })),

  reorderTab: (fromId, toId) => set(s => {
    if (fromId === toId) return s
    const fromIdx = s.tabs.findIndex(t => t.id === fromId)
    const toIdx   = s.tabs.findIndex(t => t.id === toId)
    if (fromIdx < 0 || toIdx < 0) return s
    const tabs = s.tabs.slice()
    const [moved] = tabs.splice(fromIdx, 1)
    tabs.splice(toIdx, 0, moved)
    return { tabs }
  }),

  togglePin: (id) =>
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t) })),

  setTabColor: (id, color) =>
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, color } : t) })),

  toggleBroadcast: (id) =>
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, broadcast: !t.broadcast } : t) })),

  // ── Panes ──
  splitActivePane: (dir) => {
    const { tabs, activeId } = get()
    const tab = tabs.find(t => t.id === activeId)
    if (!tab) return
    const newRoot = splitLeaf(tab.root, tab.activePane, dir)
    const allLeaves = findAllLeaves(newRoot)
    const newLeaf = allLeaves[allLeaves.length - 1]
    set(s => ({
      tabs: s.tabs.map(t =>
        t.id === activeId ? { ...t, root: newRoot, activePane: newLeaf.id } : t
      )
    }))
  },

  closePane: (paneId) => {
    const { tabs, activeId } = get()
    const tab = tabs.find(t => t.id === activeId)
    if (!tab) return
    const newRoot = removePaneFromTree(tab.root, paneId || tab.activePane)
    if (newRoot === null) {
      get().removeTab(tab.id)
      return
    }
    const newActive = findFirstLeaf(newRoot).id
    set(s => ({
      tabs: s.tabs.map(t =>
        t.id === activeId ? { ...t, root: newRoot, activePane: newActive } : t
      )
    }))
  },

  setActivePane: (tabId, paneId) =>
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, activePane: paneId } : t)
    })),

  setSplitRatio: (tabId, splitId, ratio) =>
    set(s => ({
      tabs: s.tabs.map(t => {
        if (t.id !== tabId) return t
        return { ...t, root: mapPane(t.root, splitId, sp => ({ ...sp, ratio })) }
      })
    })),

  // ── Settings ──
  setSettings: (settings) => set({ settings }),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    window.nexterm?.settings.save(settings)
    return settings
  },

  // ── Scratchpad tab ──
  addScratchTab: () => {
    const tab = createTab({ name: 'Scratchpad', scratch: true })
    set(s => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab
  },

  // ── Workspaces (named tab snapshots) ──
  saveWorkspace: (name) => {
    if (!name) return
    const { tabs, settings } = get()
    const stripPane = (p) => {
      if (!p) return p
      if (p.kind === 'leaf') return { kind: 'leaf', shell: p.shell, args: p.args, label: p.label, cwd: p.cwd }
      return { kind: 'split', dir: p.dir, ratio: p.ratio, a: stripPane(p.a), b: stripPane(p.b) }
    }
    const workspaces = {
      ...(settings.workspaces || {}),
      [name]: {
        tabs: tabs.map(t => ({
          name: t.name, pinned: t.pinned, color: t.color,
          root: stripPane(t.root)
        }))
      }
    }
    get().updateSettings({ workspaces })
  },

  deleteWorkspace: (name) => {
    const ws = { ...(get().settings.workspaces || {}) }
    delete ws[name]
    get().updateSettings({ workspaces: ws })
  },

  loadWorkspace: (name) => {
    const ws = get().settings.workspaces?.[name]
    if (!ws) return
    const refresh = (p) => {
      if (!p) return p
      if (p.kind === 'leaf') return { ...p, id: newPaneId() }
      return { ...p, id: newSplitId(), a: refresh(p.a), b: refresh(p.b) }
    }
    const newTabs = ws.tabs.map(t => {
      const root = refresh(t.root)
      const findFirst = (p) => p.kind === 'leaf' ? p.id : findFirst(p.a)
      return {
        id: newTabId(), name: t.name, root,
        activePane: findFirst(root),
        pinned: !!t.pinned, color: t.color || null, broadcast: false
      }
    })
    set({ tabs: newTabs, activeId: newTabs[0]?.id ?? null })
  },

  // ── Profiles ──
  setProfiles: (profiles) => set({ profiles }),

  openProfile: (profile) => {
    const args = []

    // Jump hosts → -J chain (must come before host)
    if (profile.jump_hosts && profile.jump_hosts.length) {
      args.push('-J', profile.jump_hosts.join(','))
    }

    // Port forwarding tunnels (-L / -R / -D)
    if (profile.tunnels && profile.tunnels.length) {
      for (const t of profile.tunnels) {
        if (t.enabled === false) continue
        if (t.type === 'D' && t.localPort) {
          args.push('-D', String(t.localPort))
        } else if ((t.type === 'L' || t.type === 'R') && t.localPort && t.remotePort) {
          const remote = `${t.remoteHost || 'localhost'}:${t.remotePort}`
          args.push(`-${t.type}`, `${t.localPort}:${remote}`)
        }
      }
    }

    if (profile.port && profile.port !== 22) args.push('-p', String(profile.port))
    if (profile.identity_file) args.push('-i', profile.identity_file)
    if (profile.extra_args) args.push(...profile.extra_args.split(/\s+/).filter(Boolean))

    // The host/user must come last so SSH sees it as the destination
    if (profile.username) args.push(`${profile.username}@${profile.host}`)
    else args.push(profile.host)

    return get().addTab({
      name: profile.name,
      shell: 'ssh.exe',
      args,
      autoReconnect: !!profile.auto_reconnect,
      profileId: profile.id
    })
  }
}))
