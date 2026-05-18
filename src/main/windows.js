// Multi-window management for NexTerm.
//
// Architecture:
// - The first window is "main" and stays around for the app lifetime.
// - Child windows are independent BrowserWindows that share IPC handlers
//   and the SQLite DB, but each renderer has its own Zustand store, so
//   tabs / panes / editor state are NOT mirrored across windows.
// - PTY events flow through safeSend → broadcasts to all windows. Each
//   renderer only listens for pty:data:<id> on PTYs IT spawned, so the
//   extra fan-out is harmless.
// - Bootstrap state is passed via a URL hash, e.g. #bootstrap=editor:C:\path

import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

const windows = new Set()    // every alive BrowserWindow we created
let primary = null            // first window — used for legacy mainWindow ref

export function registerWindow(win) {
  windows.add(win)
  if (!primary) primary = win
  win.on('closed', () => {
    windows.delete(win)
    if (primary === win) primary = [...windows][0] || null
  })
  // If THIS window's renderer dies, leave the rest alone. Reload its content
  // so the user gets a working window back instead of a blank one.
  win.webContents.on('render-process-gone', (_evt, details) => {
    console.error(`[Window ${win.id}] renderer gone:`, details?.reason, details?.exitCode)
    try {
      if (!win.isDestroyed()) win.reload()
    } catch (e) {
      console.error('[Window] reload after crash failed', e)
    }
  })
  // Same for unresponsive (rare hangs)
  win.on('unresponsive', () => {
    console.warn(`[Window ${win.id}] became unresponsive`)
  })
}

// Send to every alive renderer. Per-pty data uses channels like
// `pty:data:<id>` — renderers that don't have that PTY simply ignore.
export function broadcast(channel, ...args) {
  for (const w of windows) {
    try {
      if (w.isDestroyed()) continue
      const wc = w.webContents
      if (!wc || wc.isDestroyed()) continue
      wc.send(channel, ...args)
    } catch {}
  }
}

export function getPrimary() { return primary }

export function setPrimary(w) { primary = w }

export function getAllWindows() { return [...windows] }

// Build a bootstrap hash from a kind + payload.
function bootstrapHash(opts) {
  if (!opts) return ''
  if (opts.kind === 'editor' && opts.projectPath) {
    return '#bootstrap=editor:' + encodeURIComponent(opts.projectPath)
  }
  if (opts.kind === 'blank') return '#bootstrap=blank'
  return ''
}

export function registerWindowIpc({ buildOptions, onCreated }) {
  ipcMain.handle('window:openWith', async (_event, opts) => {
    try {
      const baseOpts = buildOptions()  // shared opts (preload, webPreferences, theme)
      const win = new BrowserWindow(baseOpts)
      registerWindow(win)

      const hash = bootstrapHash(opts || {})
      if (process.env['ELECTRON_RENDERER_URL']) {
        await win.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
      } else {
        await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace(/^#/, '') })
      }

      win.show()
      onCreated?.(win)
      return { ok: true, id: win.id }
    } catch (e) {
      console.error('[window:openWith]', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })
}
