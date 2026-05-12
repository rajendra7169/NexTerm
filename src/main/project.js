// File-system operations for the "coder mode" editor.
// Read-only directory listings, file reads, file writes, and lightweight watch.

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, writeFileSync, statSync, watch, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { join, basename, dirname, relative, sep } from 'node:path'

// Files / folders we always hide in the tree.
const IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', '.parcel-cache', '__pycache__',
  '.pytest_cache', '.venv', 'venv', '.idea', '.vscode'
])

// Max file size we'll let the editor open. PDFs / images / binaries above this
// just open in a placeholder.
const MAX_OPEN_SIZE = 5 * 1024 * 1024  // 5 MB

const watchers = new Map()  // path → { watcher, refCount, winId }

function safeSend(winId, channel, payload) {
  try {
    const win = BrowserWindow.fromId(winId)
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  } catch {}
}

function listDir(dir) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
  const items = entries
    .filter(e => !IGNORED.has(e.name) && !e.name.startsWith('.DS_Store'))
    .map(e => ({
      name: e.name,
      path: join(dir, e.name),
      isDir: e.isDirectory(),
      isFile: e.isFile(),
      isLink: e.isSymbolicLink()
    }))
    // Folders first, then files, both alphabetical
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
  return { ok: true, items }
}

function detectLanguage(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', markdown: 'markdown',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp', php: 'php', sh: 'shell', bash: 'shell', zsh: 'shell',
    ps1: 'powershell', psm1: 'powershell',
    yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', env: 'shell',
    xml: 'xml', sql: 'sql', dockerfile: 'dockerfile',
    vue: 'html', svelte: 'html'
  }
  if (basename(path).toLowerCase() === 'dockerfile') return 'dockerfile'
  return map[ext] || 'plaintext'
}

export function registerProjectIpc({ mainWindow }) {
  // Show "select folder" dialog. Returns the picked path or null on cancel.
  ipcMain.handle('project:pickFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Project',
      properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths?.[0]) return null
    return r.filePaths[0]
  })

  // List directory contents (one level).
  ipcMain.handle('project:list', async (_, dir) => listDir(dir))

  // Read a file. Returns text content or { binary: true, size } for non-text.
  ipcMain.handle('project:read', async (_, path) => {
    try {
      const stat = statSync(path)
      if (stat.size > MAX_OPEN_SIZE) {
        return { ok: false, error: `File is ${(stat.size / 1024 / 1024).toFixed(1)} MB. Limit for editor is ${MAX_OPEN_SIZE / 1024 / 1024} MB.` }
      }
      const buf = readFileSync(path)
      // Detect binary by checking for null bytes in the first 8KB
      const sample = buf.slice(0, 8192)
      let isBinary = false
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) { isBinary = true; break }
      }
      if (isBinary) {
        return { ok: true, path, binary: true, size: stat.size, mtime: stat.mtimeMs }
      }
      return {
        ok: true,
        path,
        text: buf.toString('utf8'),
        size: stat.size,
        mtime: stat.mtimeMs,
        language: detectLanguage(path)
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Write text content back to a file. Creates the file if it doesn't exist.
  ipcMain.handle('project:write', async (_, { path, text }) => {
    try {
      const dir = dirname(path)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(path, text, 'utf8')
      const stat = statSync(path)
      return { ok: true, mtime: stat.mtimeMs }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Create a new file or folder.
  ipcMain.handle('project:create', async (_, { path, isDir }) => {
    try {
      if (isDir) {
        mkdirSync(path, { recursive: true })
      } else {
        const dir = dirname(path)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        if (existsSync(path)) return { ok: false, error: 'File already exists' }
        writeFileSync(path, '', 'utf8')
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('project:delete', async (_, path) => {
    try {
      const st = statSync(path)
      if (st.isDirectory()) {
        // Refuse to recursively delete from here — too dangerous in v1.
        const entries = readdirSync(path)
        if (entries.length > 0) return { ok: false, error: 'Folder not empty' }
      }
      unlinkSync(path)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('project:rename', async (_, { from, to }) => {
    try {
      if (existsSync(to)) return { ok: false, error: 'Target already exists' }
      renameSync(from, to)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Watch a directory tree for changes. The renderer subscribes once per
  // project; events fire on 'project:fsEvent' with { path, eventType }.
  ipcMain.handle('project:watch', async (event, dir) => {
    if (watchers.has(dir)) {
      watchers.get(dir).refCount++
      return { ok: true }
    }
    try {
      const w = watch(dir, { recursive: true }, (eventType, fname) => {
        if (!fname) return
        const full = join(dir, fname)
        // Skip events inside ignored directories.
        const parts = fname.split(/[\\/]/)
        if (parts.some(p => IGNORED.has(p))) return
        safeSend(event.sender.id, 'project:fsEvent', { dir, path: full, eventType })
      })
      watchers.set(dir, { watcher: w, refCount: 1, winId: event.sender.id })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('project:unwatch', async (_, dir) => {
    const entry = watchers.get(dir)
    if (!entry) return { ok: true }
    entry.refCount--
    if (entry.refCount <= 0) {
      try { entry.watcher.close() } catch {}
      watchers.delete(dir)
    }
    return { ok: true }
  })
}
