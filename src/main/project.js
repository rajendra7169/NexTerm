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

// Silently drops the send if the window was closed between the fs event firing
// and this call — avoids crashing the watcher on a destroyed webContents.
function safeSend(winId, channel, payload) {
  try {
    const win = BrowserWindow.fromId(winId)
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  } catch { }
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
  // Parent dialog to the calling window so it doesn't steal focus.
  ipcMain.handle('project:pickFolder', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow
    const r = await dialog.showOpenDialog(parent, {
      title: 'Open Project',
      properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths?.[0]) return null
    return r.filePaths[0]
  })

  // List directory contents (one level).
  ipcMain.handle('project:list', async (_, dir) => listDir(dir))

  // Read a file. Returns text content, image data (for image extensions),
  // or { binary: true, size } for non-text non-image binaries.
  ipcMain.handle('project:read', async (_, path) => {
    try {
      const stat = statSync(path)
      if (stat.size > MAX_OPEN_SIZE) {
        return { ok: false, error: `File is ${(stat.size / 1024 / 1024).toFixed(1)} MB. Limit for editor is ${MAX_OPEN_SIZE / 1024 / 1024} MB.` }
      }
      const ext = path.split('.').pop()?.toLowerCase()
      const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
      if (IMAGE_EXTS.has(ext)) {
        const buf = readFileSync(path)
        const mime = ext === 'svg' ? 'image/svg+xml' :
          ext === 'ico' ? 'image/x-icon' :
            ext === 'jpg' ? 'image/jpeg' :
              `image/${ext}`
        return {
          ok: true, path,
          kind: 'image',
          mime,
          dataBase64: buf.toString('base64'),
          size: stat.size, mtime: stat.mtimeMs
        }
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

  // Install a small `nexterm` launcher script in %LOCALAPPDATA%\NexTerm\bin
  // and add that folder to the user PATH so the user can run `nexterm .` or
  // `nexterm <folder>` from any shell to open a project here.
  ipcMain.handle('project:installCli', async () => {
    try {
      const os = await import('node:os')
      const fs = await import('node:fs')
      const path = await import('node:path')
      const { execSync } = await import('node:child_process')

      const binDir = path.join(os.homedir(), 'AppData', 'Local', 'NexTerm', 'bin')
      if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true })

      // The current Electron exe — works in both dev and prod.
      const target = process.execPath
      const cmdScript =
        '@echo off\r\n' +
        'setlocal\r\n' +
        'set DIR=%~1\r\n' +
        'if "%DIR%"=="" set DIR=.\r\n' +
        'pushd "%DIR%"\r\n' +
        'set ABS=%CD%\r\n' +
        'popd\r\n' +
        `start "" "${target}" --editor "%ABS%"\r\n` +
        'endlocal\r\n'
      const cmdPath = path.join(binDir, 'nexterm.cmd')
      fs.writeFileSync(cmdPath, cmdScript, 'utf8')

      // Add binDir to user PATH via setx (idempotent — only if missing).
      try {
        const cur = execSync('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'PATH\',\'User\')"', { encoding: 'utf8' }).trim()
        if (!cur.split(';').map(s => s.toLowerCase()).includes(binDir.toLowerCase())) {
          execSync(`setx PATH "${cur ? cur + ';' : ''}${binDir}"`, { stdio: 'ignore' })
        }
      } catch {}
      return { ok: true, path: cmdPath, binDir, note: 'Open a NEW shell to pick up the updated PATH.' }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Read .nexterm/workspace.json from the project root (if it exists).
  // Returns the parsed JSON or null. Used to override editor/coder settings
  // per-project.
  ipcMain.handle('project:loadWorkspaceConfig', async (_, dir) => {
    const candidates = [
      join(dir, '.nexterm', 'workspace.json'),
      join(dir, '.nexterm.json')
    ]
    for (const p of candidates) {
      try {
        if (!existsSync(p)) continue
        const text = readFileSync(p, 'utf8')
        return { ok: true, path: p, config: JSON.parse(text) }
      } catch (e) {
        return { ok: false, error: `Bad workspace config: ${e?.message || e}` }
      }
    }
    return { ok: true, config: null }
  })

  // Write workspace config back (used by the Settings UI inside a project).
  ipcMain.handle('project:saveWorkspaceConfig', async (_, { dir, config }) => {
    try {
      const folder = join(dir, '.nexterm')
      if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
      const p = join(folder, 'workspace.json')
      writeFileSync(p, JSON.stringify(config, null, 2), 'utf8')
      return { ok: true, path: p }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('project:unwatch', async (_, dir) => {
    const entry = watchers.get(dir)
    if (!entry) return { ok: true }
    entry.refCount--
    if (entry.refCount <= 0) {
      try { entry.watcher.close() } catch { }
      watchers.delete(dir)
    }
    return { ok: true }
  })

  // Recursively list every file (not folder) under `dir`. Skips IGNORED
  // directories. Returns an array of { path, rel } where `rel` is the path
  // relative to the project root for display.
  ipcMain.handle('project:listAllFiles', async (_, dir) => {
    const out = []
    function walk(d) {
      let entries
      try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.DS_Store')) continue
        const full = join(d, e.name)
        if (e.isDirectory()) {
          walk(full)
        } else if (e.isFile()) {
          out.push({ path: full, rel: relative(dir, full).replace(/\\/g, '/') })
          if (out.length > 20000) return  // hard cap to keep things responsive
        }
      }
    }
    walk(dir)
    return { ok: true, items: out }
  })

  // Search file CONTENTS recursively. Returns matches grouped by file.
  // options: { caseSensitive, wholeWord, regex, maxResults }
  ipcMain.handle('project:search', async (_, { dir, query, options }) => {
    const opt = options || {}
    if (!query) return { ok: true, results: [] }
    const maxResults = Math.max(50, Math.min(5000, opt.maxResults || 1000))

    // Build the matcher.
    let re
    try {
      if (opt.regex) {
        re = new RegExp(query, opt.caseSensitive ? 'g' : 'gi')
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = opt.wholeWord ? `\\b${escaped}\\b` : escaped
        re = new RegExp(pattern, opt.caseSensitive ? 'g' : 'gi')
      }
    } catch (e) {
      return { ok: false, error: 'Invalid regex: ' + (e?.message || e) }
    }

    // Files we skip (binary / large).
    const TEXT_EXTS = new Set([
      'txt', 'md', 'json', 'yml', 'yaml', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs',
      'java', 'kt', 'swift', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
      'ps1', 'psm1', 'css', 'scss', 'less', 'html', 'xml', 'sql', 'vue', 'svelte', 'dart', 'toml', 'ini',
      'env', 'log', 'dockerfile', 'editorconfig', 'gitignore', 'npmrc', 'rc', 'conf', 'config'
    ])
    function isTextLike(p) {
      const ext = p.split('.').pop()?.toLowerCase()
      if (!ext) return true
      return TEXT_EXTS.has(ext)
    }

    const results = []
    let totalMatches = 0
    function walk(d) {
      if (totalMatches >= maxResults) return
      let entries
      try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (totalMatches >= maxResults) return
        if (IGNORED.has(e.name) || e.name.startsWith('.DS_Store')) continue
        const full = join(d, e.name)
        if (e.isDirectory()) {
          walk(full)
        } else if (e.isFile()) {
          if (!isTextLike(full)) continue
          let stat
          try { stat = statSync(full) } catch { continue }
          if (stat.size > 1024 * 1024) continue  // skip files > 1 MB
          let text
          try { text = readFileSync(full, 'utf8') } catch { continue }
          // Skip binary based on null bytes in first 8KB.
          if (text.slice(0, 8192).includes('\0')) continue
          const lines = text.split('\n')
          const matches = []
          for (let i = 0; i < lines.length; i++) {
            const ln = lines[i]
            re.lastIndex = 0
            const m = re.exec(ln)
            if (m) {
              matches.push({ line: i + 1, text: ln.length > 240 ? ln.slice(0, 240) + '…' : ln, col: m.index })
              totalMatches++
              if (totalMatches >= maxResults) break
            }
          }
          if (matches.length > 0) {
            results.push({ path: full, rel: relative(dir, full).replace(/\\/g, '/'), matches })
          }
        }
      }
    }
    walk(dir)
    return { ok: true, results, truncated: totalMatches >= maxResults }
  })
}
