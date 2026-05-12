// Action registry — used both by the global key handler and the Settings UI.
// Default keys here are overridden by anything in settings.shortcuts[id].

export const ACTIONS = [
  { id: 'newTab',     label: 'New Tab',          default: 'Ctrl+T' },
  { id: 'closePane',  label: 'Close Pane / Tab', default: 'Ctrl+Shift+W' },
  { id: 'splitRow',   label: 'Split Right',      default: 'Ctrl+Shift+D' },
  { id: 'splitCol',   label: 'Split Down',       default: 'Ctrl+Shift+E' },
  { id: 'palette',    label: 'Command Palette',  default: 'Ctrl+Shift+P' },
  { id: 'profiles',   label: 'SSH Profiles',     default: 'Ctrl+Shift+S' },
  { id: 'history',    label: 'Open History',     default: 'Ctrl+H' },
  { id: 'settings',   label: 'Open Settings',    default: 'Ctrl+,' },
  { id: 'nextTab',    label: 'Next Tab',         default: 'Ctrl+Tab' },
  { id: 'prevTab',    label: 'Previous Tab',     default: 'Ctrl+Shift+Tab' },
  { id: 'find',             label: 'Search Terminal',     default: 'Ctrl+F' },
  { id: 'toggleAlwaysOnTop', label: 'Toggle Always on Top', default: 'Ctrl+Shift+T' },
  { id: 'snippets',          label: 'Snippet Picker',       default: 'Ctrl+Alt+S' },
  { id: 'saveOutput',        label: 'Save Terminal Output', default: 'Ctrl+Shift+S' },
  { id: 'sftp',              label: 'Toggle SFTP Panel',    default: 'Ctrl+Shift+B' },
  { id: 'findAll',           label: 'Find Across All Tabs', default: 'Ctrl+Shift+F' },
  { id: 'aiBar',             label: 'AI Command Bar',       default: 'Ctrl+Shift+A' }
]

export function getKey(settings, id) {
  const s = settings?.shortcuts?.[id]
  if (s !== undefined && s !== null) return s        // empty string = unbound
  return ACTIONS.find(a => a.id === id)?.default || ''
}

// Format a KeyboardEvent into a normalized combo string like "Ctrl+Shift+P"
export function formatCombo(e) {
  const parts = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey)   parts.push('Alt')
  if (e.metaKey)  parts.push('Meta')
  let key = e.key
  // Normalize to a stable token: single char → uppercase, named keys (Tab, F1, etc.) as-is
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  if (key.length === 1) key = key.toUpperCase()
  // Special: '<' and ',' for "Ctrl+,"
  parts.push(key)
  return parts.join('+')
}

// Match a KeyboardEvent against a combo string. Returns true if they're equivalent.
export function matchKey(e, combo) {
  if (!combo || typeof combo !== 'string') return false
  const parts = combo.split('+').map(s => s.trim()).filter(Boolean)
  const key = parts.pop() || ''
  const wantCtrl  = parts.includes('Ctrl')
  const wantShift = parts.includes('Shift')
  const wantAlt   = parts.includes('Alt')
  const wantMeta  = parts.includes('Meta')

  const eKey = e.key.length === 1 ? e.key.toUpperCase() : e.key
  return e.ctrlKey  === wantCtrl  &&
         e.shiftKey === wantShift &&
         e.altKey   === wantAlt   &&
         e.metaKey  === wantMeta  &&
         eKey === key
}
