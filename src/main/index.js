import { app, BrowserWindow, ipcMain, shell, Menu, dialog, safeStorage, nativeTheme, nativeImage, globalShortcut, screen, Notification } from 'electron'
import { join } from 'path'
import { spawn } from 'node-pty'
import Database from 'better-sqlite3'
import { existsSync, readFileSync, writeFileSync, unlinkSync, createWriteStream } from 'fs'
import os, { homedir } from 'os'
import { execSync, spawn as cpSpawn } from 'child_process'
import { renderText } from './font.js'
import { Client as SshClient } from 'ssh2'
import yaml from 'js-yaml'

const USER_DATA     = app.getPath('userData')
const DB_PATH       = join(USER_DATA, 'nexterm.db')
const SETTINGS_PATH = join(USER_DATA, 'settings.json')

const ptys = new Map()
const inputBuffers = new Map()
const cwds = new Map()           // pty id → current working directory
const recordings = new Map()     // pane id → { fd: WritableStream, startTs }

// Smart cd: per-path { count, last_used } persisted to cd_freq.json
let cdFreq = null         // Map(path → {count, last})
let cdFreqWriteTimer = null
function loadCdFreq() {
  if (cdFreq) return cdFreq
  cdFreq = new Map()
  try {
    const f = join(USER_DATA, 'cd_freq.json')
    if (existsSync(f)) {
      const list = JSON.parse(readFileSync(f, 'utf8'))
      for (const e of list) cdFreq.set(e.path, { count: e.count, last: e.last })
    }
  } catch {}
  return cdFreq
}
function recordCwdFreq(path) {
  if (!path) return
  const m = loadCdFreq()
  const e = m.get(path) || { count: 0, last: 0 }
  e.count += 1
  e.last = Date.now()
  m.set(path, e)
  if (cdFreqWriteTimer) return
  cdFreqWriteTimer = setTimeout(() => {
    cdFreqWriteTimer = null
    try {
      // zoxide-style: rank by count + recency boost. Sort desc.
      const now = Date.now()
      const list = [...m.entries()]
        .map(([path, e]) => {
          const ageDays = (now - e.last) / (1000 * 60 * 60 * 24)
          const score = e.count / (1 + 0.1 * ageDays)
          return { path, count: e.count, last: e.last, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 500)
      writeFileSync(join(USER_DATA, 'cd_freq.json'), JSON.stringify(list, null, 1), 'utf8')
    } catch (err) { console.error('[cdFreq write]', err?.message) }
  }, 1500)
}

// node-pty queues writes/resizes onto its internal socket and replays them
// when the socket is ready. If the underlying pty has already exited (e.g.
// `wsl.exe` failing immediately when no distro is installed), those queued
// operations throw asynchronously from a socket event handler, escaping any
// synchronous try/catch around the resize call. Filter that specific error.
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err)
  if (/Cannot (resize|write to) a pty that has already exited/i.test(msg)) {
    return
  }
  console.error('[uncaughtException]', err)
})
let db
let mainWindow

// Win11 rounds frame:false / titleBarStyle:hidden windows by default. Force
// square corners via DwmSetWindowAttribute(33, 1) using koffi (synchronous
// FFI — pre-built binary, no native compilation needed).
let _dwmSet = null
function getDwmSet() {
  if (_dwmSet !== null) return _dwmSet
  if (process.platform !== 'win32') { _dwmSet = false; return false }
  try {
    const koffi = require('koffi')
    const dwmapi = koffi.load('dwmapi.dll')
    _dwmSet = dwmapi.func('long DwmSetWindowAttribute(void*, uint, _In_ void*, uint)')
  } catch (e) { console.error('[koffi load]', e?.message); _dwmSet = false }
  return _dwmSet
}
function setCornerPreference(win, value) {
  // value: 0 = DEFAULT, 1 = DONOTROUND, 2 = ROUND, 3 = ROUNDSMALL
  if (!win || win.isDestroyed()) return
  const fn = getDwmSet()
  if (!fn) return
  try {
    const koffi = require('koffi')
    const handleBuf = win.getNativeWindowHandle()
    const hwnd = koffi.as(handleBuf, 'void*')
    const pref = Buffer.alloc(4)
    pref.writeUInt32LE(value, 0)
    fn(hwnd, 33, pref, 4)  // DWMWA_WINDOW_CORNER_PREFERENCE = 33
  } catch (e) { console.error('[setCornerPreference]', e?.message) }
}

function safeSend(channel, ...args) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const wc = mainWindow.webContents
    if (!wc || wc.isDestroyed()) return
    wc.send(channel, ...args)
  } catch {
    // Silently drop — window torn down between checks
  }
}

// Don't let any other unhandled error crash the entire app
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e?.stack || e)
})
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e?.stack || e)
})

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  theme: 'tokyonight',
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  defaultShell: detectDefaultShell(),
  saveHistory: true,
  maxHistoryItems: 10000,
  suggestions: true,
  windowButtons: 'right',
  buttonStyle: 'windows',
  showBanner: true,
  bannerLogo: 'nexterm',
  customLogoText: 'RJ',
  customLogoSubtitle: '',

  defaultLaunch: { type: 'shell', value: 'powershell.exe', label: 'PowerShell' },
  launchOnStartup: false,
  launchSizePreset: 'medium',
  launchWidth: 1280,
  launchHeight: 800,
  terminalOpacity: 1.0,
  alwaysOnTop: false,
  runInBackground: false,
  windowBlur: 'none',
  backgroundImage: null,
  backgroundImageDim: 0.45,
  customColors: {
    background: null,
    foreground: null,
    cursor: null,
    cursorAccent: null,
    selectionBackground: null
  },
  searchUrl: 'https://www.google.com/search?q=',
  warnMultiTab: true,
  warnPasteSize: true,
  pasteWarnLimit: 5120,
  shortcuts: {},
  aliases: { global: [], projects: [] },
  bookmarks: [],
  injectSecrets: false,
  appIconsStyle: '3d',
  appIconsPosition: 'right',
  restoreSession: true,
  lastSession: null
}

function detectDefaultShell() {
  if (process.platform !== 'win32') return process.env.SHELL || '/bin/bash'
  try { execSync('where pwsh', { stdio: 'ignore' }); return 'pwsh.exe' } catch {}
  return 'powershell.exe'
}

// Cached so the banner doesn't shell out for every spawn
let __elevatedCache = null
function isElevated() {
  if (__elevatedCache !== null) return __elevatedCache
  if (process.platform !== 'win32') return (__elevatedCache = false)
  try { execSync('net session', { stdio: 'ignore' }); __elevatedCache = true }
  catch { __elevatedCache = false }
  return __elevatedCache
}

function loadSettings() {
  if (existsSync(SETTINGS_PATH)) {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } }
    catch { return { ...DEFAULT_SETTINGS } }
  }
  return { ...DEFAULT_SETTINGS }
}

const saveSettings = (s) => writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2))

// ─── Database ─────────────────────────────────────────────────────────────────

function initDB() {
  db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      command   TEXT    NOT NULL,
      directory TEXT,
      timestamp INTEGER NOT NULL,
      session   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ts  ON history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cmd ON history(command);

    CREATE TABLE IF NOT EXISTS profiles (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      host           TEXT    NOT NULL,
      port           INTEGER DEFAULT 22,
      username       TEXT,
      identity_file  TEXT,
      extra_args     TEXT,
      tunnels        TEXT,
      jump_hosts     TEXT,
      auto_reconnect INTEGER DEFAULT 0,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL UNIQUE,
      encrypted_value BLOB    NOT NULL,
      description     TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
  `)

  // Schema migrations for existing installs that predate these columns.
  // ALTER TABLE throws if the column already exists — that's expected; ignore.
  for (const sql of [
    'ALTER TABLE profiles ADD COLUMN tunnels TEXT',
    'ALTER TABLE profiles ADD COLUMN jump_hosts TEXT',
    'ALTER TABLE profiles ADD COLUMN auto_reconnect INTEGER DEFAULT 0'
  ]) {
    try { db.exec(sql) } catch {}
  }
}

function saveCommand(sessionId, command, directory) {
  const settings = loadSettings()
  if (!settings.saveHistory || !command.trim()) return
  const dir = directory || cwds.get(sessionId) || ''
  db.prepare(
    'INSERT INTO history (command, directory, timestamp, session) VALUES (?, ?, ?, ?)'
  ).run(command.trim(), dir, Date.now(), sessionId)
  const count = db.prepare('SELECT COUNT(*) as c FROM history').get().c
  if (count > settings.maxHistoryItems) {
    db.prepare(`DELETE FROM history WHERE id IN (
      SELECT id FROM history ORDER BY timestamp ASC LIMIT ?
    )`).run(count - settings.maxHistoryItems)
  }
}

// Build the active alias map for a given cwd. Project aliases override global.
function getActiveAliases(cwd, settings) {
  const a = settings.aliases || { global: [], projects: [] }
  const map = {}
  for (const x of a.global || []) if (x?.name) map[x.name] = x.command
  if (cwd && Array.isArray(a.projects)) {
    const lc = cwd.toLowerCase().replace(/\//g, '\\')
    const proj = a.projects.find(p => {
      if (!p.path) return false
      const pl = p.path.toLowerCase().replace(/\//g, '\\')
      return lc === pl || lc.startsWith(pl + '\\')
    })
    if (proj?.aliases) for (const x of proj.aliases) if (x?.name) map[x.name] = x.command
  }
  return map
}

function suggestFor(buf) {
  if (!buf || buf.length < 2) return ''
  const row = db.prepare(
    'SELECT command FROM history WHERE command LIKE ? AND command != ? ORDER BY timestamp DESC LIMIT 1'
  ).get(buf + '%', buf)
  return row?.command || ''
}

// ─── PTY ──────────────────────────────────────────────────────────────────────

function shellExists(sh) {
  if (!sh || typeof sh !== 'string') return false
  // Absolute path? Just check existence.
  if (/^[A-Za-z]:\\|^\//.test(sh)) return existsSync(sh)
  // Otherwise look it up on PATH via `where` (Windows) / `which` (POSIX).
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${cmd} ${sh}`, { stdio: 'ignore' })
    return true
  } catch { return false }
}

function createPty(id, shellPath, cwd, cols, rows, args = []) {
  const settings = loadSettings()
  let sh = shellPath || settings.defaultShell
  // Defensive: if the resolved shell is empty or doesn't exist, fall back so
  // node-pty doesn't throw a confusing "File not found:" with no path.
  if (!sh || !String(sh).trim() || !shellExists(sh)) {
    const fallback = detectDefaultShell()
    console.warn(`[PTY] shell "${sh}" not usable, falling back to ${fallback}`)
    sh = fallback
  }

  // For PowerShell, inject an init script that prints the banner, installs
  // alias functions, and an OSC-7 emitting prompt to track CWD per session.
  let actualArgs = args || []
  let bannerFile = null
  let initFile   = null
  const isPowerShell = /pwsh\.exe$|powershell\.exe$/i.test(sh)
  if (isPowerShell && actualArgs.length === 0) {
    const tmpDir = app.getPath('temp')
    const stamp  = Date.now()
    initFile = join(tmpDir, `nexterm-init-${id}-${stamp}.ps1`)

    let bannerLine = ''
    if (settings.showBanner !== false) {
      try {
        const banner = generateBanner(settings.theme || 'tokyonight')
        bannerFile = join(tmpDir, `nexterm-banner-${id}-${stamp}.txt`)
        writeFileSync(bannerFile, banner, 'utf8')
      } catch (e) { console.error('[banner write]', e?.message); bannerFile = null }
      if (bannerFile) {
        const sp = bannerFile.replace(/'/g, "''")
        const lineDelay = settings.animatedBanner === true ? '; Start-Sleep -Milliseconds 25' : ''
        // ALWAYS iterate line-by-line so we can detect the sentinel-marked
        // quote line and char-animate just that one. animatedBanner only
        // controls whether OTHER lines get a small inter-line delay too.
        bannerLine =
          `$sent = [char]0x1e\n` +
          `foreach ($l in [IO.File]::ReadAllLines('${sp}',[Text.Encoding]::UTF8)) {\n` +
          `  if ($l.Contains($sent)) {\n` +
          `    $i1 = $l.IndexOf($sent); $i2 = $l.LastIndexOf($sent)\n` +
          `    [Console]::Out.Write($l.Substring(0, $i1))\n` +
          `    [Console]::Out.Write([char]27 + '[3;90m')\n` +
          `    foreach ($c in $l.Substring($i1 + 1, $i2 - $i1 - 1).ToCharArray()) {\n` +
          `      [Console]::Out.Write($c); Start-Sleep -Milliseconds 28\n` +
          `    }\n` +
          `    [Console]::Out.Write([char]27 + '[0m')\n` +
          `    if ($l.Length -gt $i2 + 1) { [Console]::Out.Write($l.Substring($i2 + 1)) }\n` +
          `    [Console]::Out.WriteLine()\n` +
          `  } else {\n` +
          `    [Console]::Out.WriteLine($l)${lineDelay}\n` +
          `  }\n` +
          `}\n` +
          `Remove-Item -LiteralPath '${sp}' -Force -EA SilentlyContinue`
      }
    }

    // ── Build alias bootstrap ──
    const aliases = settings.aliases || { global: [], projects: [] }
    const psStr   = (s) => `'${String(s).replace(/'/g, "''")}'`
    const psHash  = (entries) => entries.length ? `@{${entries.map(([k,v]) => `${psStr(k)}=${psStr(v)}`).join(';')}}` : '@{}'

    const globalEntries = (aliases.global || []).filter(a => a?.name && a.command).map(a => [a.name, a.command])
    const projects = (aliases.projects || []).filter(p => p?.path).map(p => {
      const ents = (p.aliases || []).filter(a => a?.name && a.command).map(a => [a.name, a.command])
      return { path: p.path, hash: psHash(ents), names: ents.map(e => e[0]) }
    })
    const allNames = new Set(globalEntries.map(e => e[0]))
    projects.forEach(p => p.names.forEach(n => allNames.add(n)))
    // Don't shadow built-in important commands
    const RESERVED = new Set(['cd','ls','dir','rm','del','cp','mv','exit','clear','cls','pwd','echo','set','type'])
    const aliasFunctions = [...allNames]
      .filter(n => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !RESERVED.has(n.toLowerCase()))
      .map(n => `function global:${n} { Invoke-NexTermAlias '${n.replace(/'/g,"''")}' $args }`)
      .join('\n')

    const projectsArr = projects.length
      ? `@(${projects.map(p => `@{path=${psStr(p.path)};aliases=${p.hash}}`).join(',')})`
      : '@()'

    // ── Directory bookmarks ──
    const bookmarks = (settings.bookmarks || []).filter(b => b?.name && b?.path)
    const bookmarkHash = bookmarks.length
      ? `@{${bookmarks.map(b => `${psStr(b.name)}=${psStr(b.path)}`).join(';')}}`
      : '@{}'

    const sip = initFile.replace(/'/g, "''")
    // Force UTF-8 output so the weather glyph + box-drawing chars render correctly.
    const initScript = `try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
${bannerLine}

# ── NexTerm directory bookmarks ──
$global:nextermBookmarks = ${bookmarkHash}
function global:goto([string]$name) {
    if (-not $name) {
        Write-Host "Available bookmarks:" -ForegroundColor Cyan
        $global:nextermBookmarks.GetEnumerator() | Sort-Object Name | ForEach-Object {
            Write-Host ("  {0,-15}" -f $_.Key) -NoNewline -ForegroundColor Yellow
            Write-Host $_.Value -ForegroundColor White
        }
        return
    }
    if ($global:nextermBookmarks.ContainsKey($name)) {
        Set-Location $global:nextermBookmarks[$name]
    } else {
        Write-Host "Bookmark '$name' not found. Try 'goto' to list." -ForegroundColor Red
    }
}

# ── NexTerm alias system ──
$global:nextermAliasesGlobal   = ${psHash(globalEntries)}
$global:nextermAliasesProjects = ${projectsArr}

function global:Invoke-NexTermAlias([string]$name, [object[]]$ArgList) {
    $cwd = $null
    try { $cwd = (Get-Location -EA SilentlyContinue).ProviderPath } catch {}
    $argStr = if ($ArgList -and $ArgList.Count -gt 0) { ' ' + ($ArgList -join ' ') } else { '' }
    if ($cwd) {
        foreach ($p in $global:nextermAliasesProjects) {
            $pp = $p.path
            if (($cwd -ieq $pp) -or $cwd.ToLower().StartsWith(($pp + '\\').ToLower())) {
                if ($p.aliases.ContainsKey($name)) {
                    Invoke-Expression ($p.aliases[$name] + $argStr)
                    return
                }
            }
        }
    }
    if ($global:nextermAliasesGlobal.ContainsKey($name)) {
        Invoke-Expression ($global:nextermAliasesGlobal[$name] + $argStr)
        return
    }
}

${aliasFunctions}

# ── Command timer + smart cd (zoxide-style) ──
$global:__nexterm_freqFile = ${psStr(join(USER_DATA, 'cd_freq.json'))}
$global:__nexterm_showTimer = $${(settings.commandTimer !== false).toString()}
$global:__nexterm_promptStyle = ${psStr(settings.promptStyle || 'powerline')}

function global:cd {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Path)
    if (-not $Path -or $Path.Count -eq 0) { Set-Location ~; return }
    $target = $Path[0]
    # Real path first
    if (Test-Path -LiteralPath $target -EA SilentlyContinue) {
        Set-Location -LiteralPath $target -EA Continue
        return
    }
    # Fuzzy frequency lookup
    if (Test-Path $global:__nexterm_freqFile -EA SilentlyContinue) {
        try {
            $list = Get-Content -LiteralPath $global:__nexterm_freqFile -Raw -EA Stop |
                    ConvertFrom-Json
            $rx = [regex]::Escape($target).Replace('\\*','.*')
            $hit = $list | Where-Object { $_.path -imatch $rx } | Select-Object -First 1
            if ($hit) {
                Write-Host "→ $($hit.path)" -ForegroundColor DarkGray
                Set-Location -LiteralPath $hit.path
                return
            }
        } catch {}
    }
    Write-Host "cd: no match for '$target'" -ForegroundColor Red
}

# ── Beautiful prompt (NexTerm built-in, no install needed) ──
# Renders a colored, segmented prompt similar to Oh My Posh but bundled. Uses
# 256-color ANSI so it works in any modern terminal without a Nerd Font.
$global:__nexterm_ESC = [char]27
$global:__nexterm_gitCache = @{ dir = ''; branch = $null; dirty = $false; ts = 0 }

function global:__nexterm_pathSegments([string]$full) {
    if (-not $full) { return @() }
    # NOTE: $home is a PowerShell automatic read-only variable. Use $userHome
    # instead — assigning to $home throws and the prompt's try/catch eats it
    # silently, killing all path rendering.
    $userHome = $env:USERPROFILE
    $segments = @()
    if ($userHome -and $full.ToLower().StartsWith($userHome.ToLower())) {
        $segments += $userHome
        $rest = $full.Substring($userHome.Length)
        $segments += @($rest -split '[\\\\/]' | Where-Object { $_ -ne '' })
    } else {
        $segments = @($full -split '[\\\\/]' | Where-Object { $_ -ne '' })
    }
    if ($segments.Count -gt 5) {
        $segments = @($segments[0], '...') + $segments[-2..-1]
    }
    return $segments
}

# Stable color per segment name. Same folder = same color, every time.
function global:__nexterm_segColor([string]$s) {
    $palette = @(24, 31, 33, 67, 71, 96, 100, 130, 136, 129, 161, 165)
    $hash = 0
    foreach ($c in $s.ToLower().ToCharArray()) { $hash = ($hash * 31 + [int]$c) }
    if ($hash -lt 0) { $hash = -$hash }
    return $palette[$hash % $palette.Count]
}

function global:__nexterm_gitInfo([string]$dir) {
    # Cache per-directory; only spawn git when we change folder OR every 2s.
    $now = [int][double]::Parse((Get-Date -UFormat %s))
    if ($global:__nexterm_gitCache.dir -eq $dir -and ($now - $global:__nexterm_gitCache.ts) -lt 2) {
        return $global:__nexterm_gitCache
    }
    $branch = $null; $dirty = $false
    try {
        $branch = git -C $dir symbolic-ref --short HEAD 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $branch) { $branch = $null }
    } catch {}
    if ($branch) {
        try {
            $st = git -C $dir status --porcelain 2>$null
            if ($st) { $dirty = $true }
        } catch {}
    }
    $global:__nexterm_gitCache = @{ dir = $dir; branch = $branch; dirty = $dirty; ts = $now }
    return $global:__nexterm_gitCache
}

function global:prompt {
    $esc = $global:__nexterm_ESC
    $reset = "$esc[0m"
    [Console]::Out.Write([char]10)  # blank-line separator above prompt

    # Build the time tag once — used by every style
    $timeTag = ''
    if ($global:__nexterm_showTimer) {
        try {
            $h = Get-History -Count 1 -EA SilentlyContinue
            if ($h -and $h.EndExecutionTime -gt $h.StartExecutionTime) {
                $d = ($h.EndExecutionTime - $h.StartExecutionTime).TotalMilliseconds
                $timeTag = if     ($d -lt 1000)   { "{0:0}ms" -f $d }
                           elseif ($d -lt 60000)  { "{0:0.0}s" -f ($d/1000) }
                           else                   { "{0:0.0}m" -f ($d/60000) }
            }
        } catch {}
    }

    # Current dir + OSC 7 for cwd tracking
    $loc = $null
    try { $loc = (Get-Location -EA SilentlyContinue).ProviderPath } catch {}
    if ($loc) {
        $uri = $loc -replace '\\\\','/' -replace ' ','%20'
        [Console]::Out.Write("$esc]7;file:///$uri$esc\\")
    }

    switch ($global:__nexterm_promptStyle) {
        'minimal' {
            # Plain two-line: "1.3s C:\Users\LOQ" then "❯" on next line.
            if ($timeTag) { [Console]::Out.Write("$esc[2;37m$timeTag$reset ") }
            if ($loc)     { [Console]::Out.Write("$esc[38;5;111m$loc$reset") }
            [Console]::Out.Write([char]10)
            [Console]::Out.Write("$esc[1;38;5;81m" + [char]10095 + "$reset ")
        }
        'pills' {
            # Two-line: time + colored pills (one per path segment, no arrows),
            # then ❯ on next line.
            if ($timeTag) { [Console]::Out.Write("$esc[2;37m$timeTag$reset ") }
            try {
                if ($loc) {
                    $parts = __nexterm_pathSegments $loc
                    foreach ($seg in $parts) {
                        $bg = if ($seg -eq '...') { 240 } else { __nexterm_segColor $seg }
                        [Console]::Out.Write("$esc[48;5;$($bg);38;5;231m $seg $reset ")
                    }
                    $g = __nexterm_gitInfo $loc
                    if ($g.branch) {
                        $gbg = if ($g.dirty) { 178 } else { 34 }
                        $marker = if ($g.dirty) { '*' } else { '' }
                        [Console]::Out.Write("$esc[48;5;$($gbg);38;5;232m  $($g.branch)$marker $reset")
                    }
                }
            } catch {}
            [Console]::Out.Write([char]10)
            [Console]::Out.Write("$esc[1;38;5;81m" + [char]10095 + "$reset ")
        }
        'classic' {
            # One-line classic: "[1.3s] PS C:\Users\LOQ>"
            if ($timeTag) { [Console]::Out.Write("$esc[2;37m[$timeTag]$reset ") }
            [Console]::Out.Write("$esc[1;36mPS$reset ")
            if ($loc) { [Console]::Out.Write("$esc[38;5;111m$loc$reset") }
            [Console]::Out.Write("$esc[1;36m>$reset ")
        }
        default {
            # Powerline (segments + ▶ arrows + ❯ pointer)
            if ($timeTag) { [Console]::Out.Write("$esc[2;37m[$timeTag]$reset ") }
            [Console]::Out.Write("$esc[1;36mPS$reset ")
            $prevBg = $null
            try {
                if ($loc) {
                    $parts = __nexterm_pathSegments $loc
                    foreach ($seg in $parts) {
                        $bg = if ($seg -eq '...') { 240 } else { __nexterm_segColor $seg }
                        if ($null -ne $prevBg) {
                            [Console]::Out.Write("$esc[48;5;$($bg);38;5;$($prevBg)m" + [char]9658 + "$reset")
                        }
                        [Console]::Out.Write("$esc[48;5;$($bg);38;5;231m $seg $reset")
                        $prevBg = $bg
                    }
                }
                if ($loc) {
                    $g = __nexterm_gitInfo $loc
                    if ($g.branch) {
                        $gbg = if ($g.dirty) { 178 } else { 34 }
                        $marker = if ($g.dirty) { '*' } else { '' }
                        if ($null -ne $prevBg) {
                            [Console]::Out.Write("$esc[48;5;$($gbg);38;5;$($prevBg)m" + [char]9658 + "$reset")
                        }
                        [Console]::Out.Write("$esc[48;5;$($gbg);38;5;232m  $($g.branch)$marker $reset")
                        $prevBg = $gbg
                    }
                }
                if ($null -ne $prevBg) {
                    [Console]::Out.Write("$esc[38;5;$($prevBg)m" + [char]9658 + "$reset")
                }
            } catch {
                [Console]::Out.Write(" $loc")
            }
            [Console]::Out.Write(" $esc[1;38;5;81m" + [char]10095 + "$reset ")
        }
    }
    return ' '
}

Remove-Item -LiteralPath '${sip}' -Force -EA SilentlyContinue
`
    try {
      writeFileSync(initFile, initScript, 'utf8')
      actualArgs = ['-NoLogo', '-NoExit', '-Command', `. '${sip}'`]
    } catch (e) {
      console.error('[init write]', e?.message)
      initFile = null
      // Fall back to direct PowerShell with no init script
      actualArgs = ['-NoLogo']
    }
  }

  // Build env, optionally with decrypted secrets
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  if (settings.injectSecrets === true) {
    try {
      const rows = db.prepare('SELECT name, encrypted_value FROM secrets').all()
      for (const r of rows) {
        try { env[r.name] = safeStorage.decryptString(r.encrypted_value) } catch {}
      }
    } catch {}
  }

  const pty = spawn(sh, actualArgs, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || homedir(),
    env
  })

  ptys.set(id, pty)
  inputBuffers.set(id, '')
  console.log(`[PTY] spawned pid=${pty.pid} shell=${sh} actualArgs[0..2]=${JSON.stringify(actualArgs.slice(0,3))}`)

  pty.onData(data => {
    try {
      // Detect OSC 7: \x1b]7;file://host/path\x1b\\ (or \x07)
      const re = /\x1b\]7;file:\/\/[^/]*\/([^\x07\x1b]+)(?:\x07|\x1b\\)/g
      let m, last = null
      while ((m = re.exec(data)) !== null) {
        try { last = decodeURIComponent(m[1]) } catch { last = m[1] }
      }
      if (last) {
        const norm = last.replace(/\//g, '\\').replace(/^\\/, '')
        if (norm !== cwds.get(id)) {
          cwds.set(id, norm)
          safeSend(`cwd:${id}`, norm)
          recordCwdFreq(norm)
        }
      }
      safeSend(`pty:data:${id}`, data)
      // If a recording is active for this pane, append an asciinema v2 event
      const rec = recordings.get(id)
      if (rec) {
        try {
          const t = (Date.now() - rec.startTs) / 1000
          rec.fd.write(JSON.stringify([t, 'o', data]) + '\n')
        } catch {}
      }
    } catch (e) { console.error('[onData]', e) }
  })
  pty.onExit(({ exitCode }) => {
    try {
      ptys.delete(id)
      inputBuffers.delete(id)
      cwds.delete(id)
      if (bannerFile) { try { unlinkSync(bannerFile) } catch {} }
      if (initFile)   { try { unlinkSync(initFile)   } catch {} }
      safeSend(`pty:exit:${id}`, exitCode)
    } catch (e) { console.error('[onExit]', e) }
  })
}

// ─── Banner widgets (Public IP, weather, internet, crypto) ──────────────────
// Async fetched in background, cached for 5 min. Banner reads cache synchronously.
const widgetCache = {
  city: null, country: null,
  lat: null, lon: null,
  weatherCode: null, weatherTemp: null,
  fetchedAt: 0
}
async function fetchJson(url, timeoutMs = 4000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NexTerm/0.1' } })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
  finally { clearTimeout(t) }
}
async function sampleCpuPct(intervalMs = 200) {
  const snap = () => os.cpus().map(c => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0)
    return { idle: c.times.idle, total }
  })
  const a = snap()
  await new Promise(r => setTimeout(r, intervalMs))
  const b = snap()
  let busy = 0, total = 0
  for (let i = 0; i < a.length; i++) {
    const dt = b[i].total - a[i].total
    const di = b[i].idle  - a[i].idle
    busy  += dt - di
    total += dt
  }
  return total > 0 ? Math.round((busy / total) * 100) : 0
}
function sampleGpuPct() {
  // Fast path: nvidia-smi for NVIDIA cards
  return new Promise(resolve => {
    try {
      const proc = cpSpawn('nvidia-smi', ['--query-gpu=utilization.gpu','--format=csv,noheader,nounits'], { windowsHide: true })
      let buf = ''
      const timer = setTimeout(() => { try { proc.kill() } catch {}; resolve(null) }, 1500)
      proc.stdout.on('data', d => buf += d.toString())
      proc.on('close', code => {
        clearTimeout(timer)
        if (code !== 0) return resolve(null)
        const v = parseInt(buf.trim().split(/\r?\n/)[0], 10)
        resolve(isNaN(v) ? null : v)
      })
      proc.on('error', () => { clearTimeout(timer); resolve(null) })
    } catch { resolve(null) }
  })
}
async function refreshWidgetCache() {
  const settings = loadSettings()
  const w = settings.widgets || {}
  // Weather (needs IP-based geolocation first — one ipapi.co call gives both)
  if (w.weather !== false) {
    const ipinfo = await fetchJson('https://ipapi.co/json/')
    if (ipinfo) {
      widgetCache.city    = ipinfo.city || null
      widgetCache.country = ipinfo.country_name || ipinfo.country || null
      widgetCache.lat     = ipinfo.latitude  ?? null
      widgetCache.lon     = ipinfo.longitude ?? null
    }
    if (widgetCache.lat != null) {
      const wx = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${widgetCache.lat}&longitude=${widgetCache.lon}&current=temperature_2m,weather_code`)
      if (wx?.current) {
        widgetCache.weatherTemp = wx.current.temperature_2m
        widgetCache.weatherCode = wx.current.weather_code
      }
    }
  }
  widgetCache.fetchedAt = Date.now()
}
// Map open-meteo WMO weather code → single-codepoint glyph + label.
// Uses basic-plane Unicode (rendered by every monospace font, unlike emoji
// which require a color-emoji font Cascadia/Consolas don't ship with).
function weatherEmoji(code) {
  if (code == null)  return ['·', '—']
  if (code === 0)    return ['☀', 'Clear']
  if (code <= 3)     return ['☁', 'Cloudy']
  if (code <= 48)    return ['≋', 'Fog']
  if (code <= 57)    return ['☂', 'Drizzle']
  if (code <= 67)    return ['☂', 'Rain']
  if (code <= 77)    return ['❄', 'Snow']
  if (code <= 82)    return ['☂', 'Showers']
  if (code <= 86)    return ['❄', 'Snow showers']
  if (code <= 99)    return ['⚡', 'Storm']
  return ['·', '—']
}

// ─── Welcome Banner ──────────────────────────────────────────────────────────

// Read from package.json via Electron's app.getVersion(), so the banner always
// reflects the actual shipped build instead of a hardcoded literal that drifts.
const NEXTERM_VERSION = app.getVersion()

// Convert os.release() like "10.0.26200" to the real marketing version.
// Win11's build number is >= 22000 — Microsoft kept the kernel as 10.0.x
// internally, which is why os.release() reports "10" for Win11 too.
function winMarketingVersion() {
  const rel = os.release() || ''
  const parts = rel.split('.').map(n => parseInt(n, 10))
  const major = parts[0], build = parts[2]
  if (major === 10 && build >= 22000) return `11 (build ${build})`
  if (major === 10) return `10 (build ${build || rel})`
  return rel
}

// Logo art collection — each is an array of pre-colorized ANSI lines.
const LOGOS = {
  nexterm: [
    '\x1b[1;36m   ███╗   ██╗ ██╗  ██╗\x1b[0m',
    '\x1b[1;36m   ████╗  ██║ ╚██╗██╔╝\x1b[0m',
    '\x1b[1;34m   ██╔██╗ ██║  ╚███╔╝ \x1b[0m',
    '\x1b[1;34m   ██║╚██╗██║  ██╔██╗ \x1b[0m',
    '\x1b[1;35m   ██║ ╚████║ ██╔╝ ██╗\x1b[0m',
    '\x1b[1;35m   ╚═╝  ╚═══╝ ╚═╝  ╚═╝\x1b[0m',
    '\x1b[90m     ─── NEXTERM ───  \x1b[0m'
  ],

  // Windows 7 — classic neofetch/screenfetch swooshy 4-color flag
  windows: [
    "\x1b[1;31m        ,.=:!!t3Z3z.,\x1b[0m",
    "\x1b[1;31m       :tt:::tt333EE3\x1b[0m",
    "\x1b[1;31m       Et:::ztt33EEEL\x1b[0m \x1b[1;32m@Ee.,      ..,\x1b[0m",
    "\x1b[1;31m      ;tt:::tt333EE7\x1b[0m \x1b[1;32m;EEEEEEttttt33#\x1b[0m",
    "\x1b[1;31m     :Et:::zt333EEQ.\x1b[0m \x1b[1;32m$EEEEEEttttt33QL\x1b[0m",
    "\x1b[1;31m     it::::tt333EEF\x1b[0m \x1b[1;32m@EEEEEEttttt33F\x1b[0m",
    "\x1b[1;31m    ;3=*^```'*4EEV\x1b[0m \x1b[1;32m:EEEEEEtttz33QF\x1b[0m",
    "\x1b[1;34m    ,.=::::!t=., `\x1b[0m \x1b[1;32m@EEEEEEtttz33QF\x1b[0m",
    "\x1b[1;34m   ;::::::::zt33)\x1b[0m   \x1b[1;33m\"4EEEtttji3P*\x1b[0m",
    "\x1b[1;34m  :t::::::::tt33.\x1b[1;33m:Z3z..\x1b[0m  \x1b[1;33m`` ,..g.\x1b[0m",
    "\x1b[1;34m  i::::::::zt33F\x1b[0m \x1b[1;33mAEEEtttt::::ztF\x1b[0m",
    "\x1b[1;34m ;:::::::::t33V\x1b[0m \x1b[1;33m;EEEttttt::::t3\x1b[0m",
    "\x1b[1;34m E::::::::zt33L\x1b[0m \x1b[1;33m@EEEtttt::::z3F\x1b[0m",
    "\x1b[1;34m{3=*^```'*4E3)\x1b[0m \x1b[1;33m;EEEttttt:::::tZ`\x1b[0m",
    "\x1b[1;34m             `\x1b[0m \x1b[1;33m:EEEEtttt::::z7\x1b[0m",
    "                 \x1b[1;33m\"VEzjt:;;z>*`\x1b[0m"
  ],

  // Tux — Linux mascot, white body / yellow beak & feet
  tux: [
    "\x1b[1;37m         .--.\x1b[0m       ",
    "\x1b[1;37m        |\x1b[0m\x1b[30mo_o\x1b[1;37m |\x1b[0m       ",
    "\x1b[1;37m        |\x1b[1;33m:_/\x1b[1;37m |\x1b[0m       ",
    "\x1b[1;37m       //   \\ \\\x1b[0m    ",
    "\x1b[1;37m      (|     | )\x1b[0m   ",
    "\x1b[1;33m     /'\\_   _/'\\\x1b[0m  ",
    "\x1b[1;33m     \\___)=(___/\x1b[0m   "
  ],

  cat: [
    "\x1b[1;95m     /\\_____/\\\x1b[0m",
    "\x1b[1;95m    /  o   o  \\\x1b[0m",
    "\x1b[1;95m   ( ==  ^  == )\x1b[0m",
    "\x1b[1;95m    )         (\x1b[0m",
    "\x1b[1;95m   (           )\x1b[0m",
    "\x1b[1;95m  ( (  )   (  ) )\x1b[0m",
    "\x1b[1;95m (__(__)___(__)__)\x1b[0m"
  ],

  none: []
}

// Strip ANSI styling AND our U+001E sentinel markers when measuring visible width.
const visibleLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1e/g, '').length

function fmtUptime(s) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const out = []
  if (d) out.push(`${d}d`)
  if (h) out.push(`${h}h`)
  out.push(`${m}m`)
  return out.join(' ')
}

const fmtGiB = (b) => (b / 1073741824).toFixed(1) + ' GiB'

function resolveLogo(settings) {
  const key = settings.bannerLogo || 'nexterm'
  if (key === 'custom') {
    return renderText(settings.customLogoText || 'NX', settings.customLogoSubtitle || '')
  }
  return LOGOS[key] || LOGOS.nexterm
}

// Year progress — 12 month dots (past = red, current = highlighted, future =
// dim) plus a "day N/total" counter. Compact enough to live on one banner line.
function buildYearProgressLine() {
  const now = new Date()
  const year  = now.getFullYear()
  const start = new Date(year, 0, 1)
  const end   = new Date(year + 1, 0, 1)
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1
  const daysInYear = Math.floor((end - start) / (1000 * 60 * 60 * 24))
  const curMonth = now.getMonth()  // 0..11
  const Y = '\x1b[1;33m'           // yellow label
  const Rd = '\x1b[31m'             // dim red for past
  const Hi = '\x1b[1;36m'           // bright cyan for current
  const D  = '\x1b[90m'             // dim gray for future
  const F  = '\x1b[39m', R = '\x1b[0m'
  let dots = ''
  for (let m = 0; m < 12; m++) {
    if (m < curMonth)  dots += `${Rd}●${R}`
    else if (m === curMonth) dots += `${Hi}◉${R}`
    else dots += `${D}·${R}`
  }
  return `${Y}Year${R}      ${dots} ${D}${dayOfYear}/${daysInYear}${R}`
}

// Weather inline (rendered after username@hostname on the header line)
function inlineWeather() {
  const w = loadSettings().widgets || {}
  if (w.weather === false) return ''
  if (widgetCache.weatherTemp == null) return ''
  const [emoji] = weatherEmoji(widgetCache.weatherCode)
  const D  = '\x1b[90m', Yl = '\x1b[1;33m', R = '\x1b[0m'
  const loc = widgetCache.city ? ` ${D}${widgetCache.city}${R}` : ''
  return `   ${emoji} ${Yl}${Math.round(widgetCache.weatherTemp)}°C${R}${loc}`
}
// Compact horizontal bar: ▓-filled / ░-empty, color-graded by percentage.
function pctBar(pct, width = 6) {
  if (pct == null) return null
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  const col = pct >= 80 ? '\x1b[1;31m' : pct >= 50 ? '\x1b[1;33m' : '\x1b[1;32m'
  const D = '\x1b[90m', R = '\x1b[0m'
  return `${col}${'▓'.repeat(filled)}${R}${D}${'░'.repeat(width - filled)}${R}`
}
// (CPU/GPU/RAM load bars now live in the bottom status bar — see StatusBar.jsx)

// Coder / hacker / sci-fi one-liners shown under the "─── NEXTERM ───" label.
// One is picked at random per new tab so the banner feels alive.
const CODER_QUOTES = [
  "ready to rock",
  "systems nominal",
  "online · go forth",
  "init complete",
  "armed · loaded · go",
  "compiled with ☕",
  "in code we trust",
  "404: bugs not found",
  "stack overflow free",
  "kernel breathing fine",
  "shell ready, captain",
  "the future is now",
  "rebooting reality.exe",
  "rm -rf /worries",
  "hack the planet",
  "powered by caffeine",
  "git gud · ship fast",
  "make it work, then fast",
  "engage warp drive",
  "matrix loaded · enter",
  "ssh into the unknown",
  "pwsh wizard online",
  "to debug, perchance",
  "neon · dark · ready",
  "1's and 0's aligned",
  "daemons sleeping well",
  "uptime 100% · vibes",
  "you have the shell",
  "press any key to ascend",
  "boot.sequence.success",
  "listening on :prompt",
  "0x00 to glory",
  "runtime initialized",
  "the cake is a lie",
  "echo \"hello, world\"",
  ">_ awaiting input",
  "just ship it",
  "pipe dreams realized"
]
function pickCoderQuote() {
  return CODER_QUOTES[Math.floor(Math.random() * CODER_QUOTES.length)]
}

function generateBanner(themeName = 'tokyonight') {
  const settings = loadSettings()
  const baseLogo = resolveLogo(settings) || []
  // Append a random coder one-liner centered under the logo, prefixed with a
  // ❯ chevron. Wrapped in U+001E (Record Separator) sentinels so the PS init
  // script types it char-by-char on tab open. Italic-dim styling is applied
  // by the PS animator, not baked into the string here.
  const baseLogoW = baseLogo.length ? Math.max(...baseLogo.map(visibleLen)) : 0
  const quoteText = `❯ ${pickCoderQuote()}`
  const quotePad  = ' '.repeat(Math.max(0, Math.floor((baseLogoW - quoteText.length) / 2)))
  const SENT      = '\x1e'
  const quote     = `${quotePad}${SENT}${quoteText}${SENT}`
  const logo      = baseLogo.length ? [...baseLogo, quote] : baseLogo
  // CPU/GPU/RAM bars are now live in the bottom status bar — no longer in
  // the banner where they'd freeze as soon as the user typed anything.
  const cpus     = os.cpus()
  const cpuModel = (cpus[0]?.model || 'Unknown CPU').replace(/\s+/g, ' ').trim()
  const ramT     = os.totalmem()
  const ramU     = ramT - os.freemem()
  const ramPct   = Math.round((ramU / ramT) * 100)
  const username = os.userInfo().username
  const hostname = os.hostname()
  const winRel   = os.release()
  const arch     = os.arch()

  // Y = bold yellow label, F = foreground value, D = dim, R = reset
  // F = default foreground (xterm uses theme.foreground — readable in both light + dark themes)
  // Y = bold yellow label  D = dim grey  M = bold magenta
  const Y = '\x1b[1;33m', F = '\x1b[39m', D = '\x1b[90m', M = '\x1b[1;35m', R = '\x1b[0m'
  const weatherTail = inlineWeather()
  const userLine = `${M}${username}${R}${D}@${R}${M}${hostname}${R}${weatherTail}`
  const sepLen   = (username + '@' + hostname).length
  const sep      = `${D}${'─'.repeat(sepLen)}${R}`

  const lines = [
    userLine,
    sep,
    `${Y}OS${R}        ${F}Windows ${winMarketingVersion()} (${arch})${R}`,
    `${Y}CPU${R}       ${F}${cpuModel} (${cpus.length})${R}`,
    `${Y}Uptime${R}    ${F}${fmtUptime(os.uptime())}${R}`,
    `${Y}Mode${R}      ${isElevated() ? '\x1b[1;91mAdmin\x1b[0m' : F + 'User' + R}`,
    `${Y}NexTerm${R}   ${F}v${NEXTERM_VERSION} ${D}·${R} ${F}${themeName}${R}`,
    buildYearProgressLine()
  ]

  const out = ['']
  const logoW = logo.length ? Math.max(...logo.map(visibleLen)) : 0
  const rightW = lines.length ? Math.max(...lines.map(visibleLen)) : 0
  const rows  = Math.max(logo.length, lines.length)
  for (let i = 0; i < rows; i++) {
    const leftRaw = logo[i] || ''
    const leftPad = ' '.repeat(Math.max(0, logoW - visibleLen(leftRaw)))
    const right   = lines[i] || ''
    const colGap  = logoW > 0 ? '    ' : ''
    out.push(`  ${leftRaw}${leftPad}${colGap}${right}`)
  }

  // Full-width BASE divider — spans both columns, closing off the whole panel.
  const totalW = 2 + logoW + (logoW > 0 ? 4 : 0) + rightW
  out.push(`  ${D}${'─'.repeat(Math.max(0, totalW - 2))}${R}`)
  out.push('')
  return out.join('\r\n') + '\r\n'
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle('banner:get',          (_, opts = {}) => generateBanner(opts.theme))
  ipcMain.handle('banner:logos',        () => LOGOS)
  ipcMain.handle('banner:renderCustom', (_, { text, subtitle } = {}) => renderText(text, subtitle))

  // PTY
  ipcMain.handle('pty:create', (_, { id, shell: sh, cwd, cols, rows, args }) => {
    try {
      createPty(id, sh, cwd, cols, rows, args)
      return { ok: true }
    } catch (e) {
      const msg = String(e?.message || e)
      const tried = sh || loadSettings().defaultShell || '(default)'
      console.error('[PTY] create FAILED:', e)
      return { ok: false, error: `${msg}\nShell tried: ${tried}` }
    }
  })

  ipcMain.on('pty:write', (_, { id, data }) => {
    try {
      const pty = ptys.get(id)
      if (!pty) return
      try { pty.write(data) } catch (e) { console.error('[pty.write]', e?.message); return }

      if (data.includes('\x1b')) return

      const settings = loadSettings()
      let buf = inputBuffers.get(id) || ''
      let inputChanged = false

      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          if (buf.trim()) {
            try { saveCommand(id, buf.trim(), '') } catch {}
          }
          buf = ''
          inputChanged = true
        } else if (ch === '\x7f' || ch === '\b') {
          if (buf.length > 0) { buf = buf.slice(0, -1); inputChanged = true }
        } else if (ch === '\t') {
          // Tab — don't add to buffer
        } else if (ch >= ' ') {
          buf += ch
          inputChanged = true
        }
      }

      inputBuffers.set(id, buf)

      if (inputChanged && settings.suggestions) {
        try {
          const suggestion = suggestFor(buf)
          safeSend(`suggest:${id}`, { input: buf, suggestion })
        } catch {}
      }
    } catch (e) {
      console.error('[pty:write outer]', e?.message)
    }
  })

  ipcMain.handle('pty:resize', (_, { id, cols, rows }) => {
    try { ptys.get(id)?.resize(cols, rows) } catch {}
  })

  ipcMain.handle('pty:kill', (_, { id }) => {
    try { ptys.get(id)?.kill() } catch {}
    ptys.delete(id)
    inputBuffers.delete(id)
    cwds.delete(id)
  })

  // History — supports scope ('all' | 'cwd' | 'tree') with per-session cwd
  ipcMain.handle('history:get', (_, { limit = 500, search = '', scope, cwd } = {}) => {
    let sql = 'SELECT * FROM history WHERE 1=1'
    const params = []
    if (search) { sql += ' AND command LIKE ?'; params.push(`%${search}%`) }
    if (scope === 'cwd' && cwd) {
      sql += ' AND directory = ?'
      params.push(cwd)
    } else if (scope === 'tree' && cwd) {
      sql += ' AND (directory = ? OR directory LIKE ?)'
      params.push(cwd, cwd + '\\%')
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(limit)
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('cwd:get', (_, id) => cwds.get(id) || '')

  // ── Secure Vault — encrypts via OS keychain (DPAPI on Windows) ──
  ipcMain.handle('vault:list', () =>
    db.prepare('SELECT id, name, description, created_at, updated_at FROM secrets ORDER BY name').all()
  )

  ipcMain.handle('vault:get', (_, name) => {
    const row = db.prepare('SELECT encrypted_value FROM secrets WHERE name = ?').get(name)
    if (!row) return null
    try {
      return safeStorage.decryptString(row.encrypted_value)
    } catch { return null }
  })

  ipcMain.handle('vault:set', (_, { name, value, description }) => {
    if (!name || value == null) return { ok: false, error: 'name and value required' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS encryption unavailable' }
    }
    const enc = safeStorage.encryptString(String(value))
    const now = Date.now()
    const existing = db.prepare('SELECT id FROM secrets WHERE name = ?').get(name)
    if (existing) {
      db.prepare(
        'UPDATE secrets SET encrypted_value=?, description=?, updated_at=? WHERE name=?'
      ).run(enc, description || '', now, name)
    } else {
      db.prepare(
        'INSERT INTO secrets (name, encrypted_value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(name, enc, description || '', now, now)
    }
    return { ok: true }
  })

  ipcMain.handle('vault:delete', (_, name) => {
    db.prepare('DELETE FROM secrets WHERE name = ?').run(name)
    return { ok: true }
  })

  // Session persistence — renderer serializes its tab/pane tree on close
  ipcMain.handle('session:save', (_, snapshot) => {
    const s = loadSettings()
    s.lastSession = snapshot
    saveSettings(s)
    return true
  })
  ipcMain.handle('session:get', () => {
    const s = loadSettings()
    return s.restoreSession === false ? null : (s.lastSession || null)
  })
  ipcMain.handle('session:clear', () => {
    const s = loadSettings()
    s.lastSession = null
    saveSettings(s)
    return true
  })

  ipcMain.handle('history:clear', () => { db.prepare('DELETE FROM history').run() })

  // Settings
  ipcMain.handle('settings:get',  ()    => loadSettings())
  ipcMain.handle('settings:save', (_, s) => {
    saveSettings(s)
    // Sync native UI theme to follow the app theme
    try {
      const bg = THEME_BG[s.theme] || '#1a1b26'
      nativeTheme.themeSource = /^#[fed]/i.test(bg) ? 'light' : 'dark'
    } catch {}
    return true
  })

  ipcMain.handle('settings:path',    () => SETTINGS_PATH)
  ipcMain.handle('settings:reveal',  () => shell.showItemInFolder(SETTINGS_PATH))
  ipcMain.handle('settings:openEditor', () => shell.openPath(SETTINGS_PATH))

  ipcMain.handle('settings:export', async () => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Export NexTerm settings',
      defaultPath: `nexterm-settings-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false }
    writeFileSync(r.filePath, JSON.stringify(loadSettings(), null, 2))
    return { ok: true, path: r.filePath }
  })

  ipcMain.handle('settings:import', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Import NexTerm settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths?.[0]) return { ok: false }
    try {
      const data = JSON.parse(readFileSync(r.filePaths[0], 'utf-8'))
      if (typeof data !== 'object' || !data) throw new Error('Invalid JSON')
      saveSettings({ ...loadSettings(), ...data })
      return { ok: true, path: r.filePaths[0] }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('settings:reset', () => {
    saveSettings({ ...DEFAULT_SETTINGS })
    return { ok: true }
  })

  // Auto-launch on system startup (Windows: registers app in Run key)
  ipcMain.handle('startup:get', () => {
    const s = app.getLoginItemSettings()
    return s.openAtLogin === true
  })
  // ── Admin / elevation ──
  ipcMain.handle('app:isAdmin', () => isElevated())

  // First non-flag argv arg, if it's an existing directory — used by Explorer
  // "Open NexTerm here" so the first tab spawns in that folder.
  ipcMain.handle('app:initialCwd', () => {
    try {
      const args = process.argv.slice(1).filter(a => a && !a.startsWith('-'))
      for (const a of args) {
        if (existsSync(a)) {
          const stat = require('fs').statSync(a)
          if (stat.isDirectory()) return a
        }
      }
    } catch {}
    return null
  })

  function getRelaunchArgs() {
    return process.argv.slice(1).filter(a =>
      !a.startsWith('--inspect') && !a.startsWith('--remote-debugging-port')
    )
  }

  // PowerShell quoting helper: wrap in single quotes, double up any internal '
  const psSingle = (s) => `'${String(s).replace(/'/g, "''")}'`

  function tryRelaunchElevated() {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve({ ok: false, error: 'Windows only' })
      const args = getRelaunchArgs()
      const target = process.execPath
      const argList = args.length
        ? '-ArgumentList @(' + args.map(psSingle).join(',') + ')'
        : ''
      const cmd = `try { Start-Process -FilePath ${psSingle(target)} ${argList} -Verb RunAs -ErrorAction Stop; exit 0 } catch { Write-Error $_; exit 1 }`

      const ps = cpSpawn('powershell', ['-NoProfile', '-Command', cmd], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      ps.stderr?.on('data', d => { stderr += d.toString() })
      ps.on('error', e => resolve({ ok: false, error: e.message }))
      ps.on('exit', code => {
        if (code === 0) {
          global.__forceQuit = true
          setTimeout(() => app.quit(), 400)
          resolve({ ok: true })
        } else {
          resolve({ ok: false, error: stderr.trim() || 'UAC canceled or Start-Process failed' })
        }
      })
    })
  }

  // De-elevation: write a temp .bat that launches the full command line, then
  // hand it to explorer.exe (which runs as the logged-in user → drops admin token).
  function tryRelaunchAsUser() {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve({ ok: false, error: 'Windows only' })
      try {
        const path = require('path')
        const args = getRelaunchArgs().map(a => {
          if (/[\\/]/.test(a) && !a.startsWith('-')) {
            try { return path.resolve(process.cwd(), a) } catch { return a }
          }
          return a
        })
        const target  = process.execPath
        const workDir = process.cwd()

        // VBS string escape: wrap in "..." with internal " doubled
        const vbsStr = (s) => '"' + String(s).replace(/"/g, '""') + '"'
        // Each CLI arg quoted, joined with spaces, then wrapped in a VBS string
        const cliArgs = args.map(a => `"${a.replace(/"/g, '""')}"`).join(' ')

        const vbsPath = join(app.getPath('temp'), `nexterm-relaunch-${Date.now()}.vbs`)
        const vbs = [
          'Set sh = CreateObject("Shell.Application")',
          `sh.ShellExecute ${vbsStr(target)}, ${vbsStr(cliArgs)}, ${vbsStr(workDir)}, "open", 1`,
          'WScript.Sleep 800',
          'Set fso = CreateObject("Scripting.FileSystemObject")',
          'On Error Resume Next',
          'fso.DeleteFile WScript.ScriptFullName',
          ''
        ].join('\r\n')

        writeFileSync(vbsPath, vbs, 'utf8')
        console.log('[de-elevate] launching vbs:', vbsPath)
        // explorer.exe opens .vbs via wscript.exe (GUI, no console) under user's token
        cpSpawn('explorer.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
        global.__forceQuit = true
        setTimeout(() => { app.quit(); resolve({ ok: true }) }, 500)
      } catch (e) {
        resolve({ ok: false, error: e.message })
      }
    })
  }

  ipcMain.handle('app:relaunchAsAdmin', () => tryRelaunchElevated())
  ipcMain.handle('app:relaunchAsUser',  () => tryRelaunchAsUser())

  // Tell renderer if we're in dev mode (so it can warn that admin relaunch is unreliable here)
  ipcMain.handle('app:isDev', () => !!process.env['ELECTRON_RENDERER_URL'])

  ipcMain.handle('startup:set', (_, on) => {
    app.setLoginItemSettings({
      openAtLogin: !!on,
      path: process.execPath,
      args: []
    })
    return app.getLoginItemSettings().openAtLogin === true
  })

  // Profiles
  function decodeProfile(row) {
    if (!row) return row
    return {
      ...row,
      tunnels:        row.tunnels    ? JSON.parse(row.tunnels)    : [],
      jump_hosts:     row.jump_hosts ? JSON.parse(row.jump_hosts) : [],
      auto_reconnect: !!row.auto_reconnect
    }
  }
  ipcMain.handle('profile:list', () =>
    db.prepare('SELECT * FROM profiles ORDER BY name').all().map(decodeProfile)
  )

  ipcMain.handle('profile:add', (_, p) => {
    const result = db.prepare(`
      INSERT INTO profiles (name, host, port, username, identity_file, extra_args, tunnels, jump_hosts, auto_reconnect, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.name, p.host, p.port || 22, p.username || null, p.identity_file || null, p.extra_args || null,
      p.tunnels    ? JSON.stringify(p.tunnels)    : null,
      p.jump_hosts ? JSON.stringify(p.jump_hosts) : null,
      p.auto_reconnect ? 1 : 0,
      Date.now()
    )
    return decodeProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('profile:update', (_, p) => {
    db.prepare(`
      UPDATE profiles SET name=?, host=?, port=?, username=?, identity_file=?, extra_args=?,
                          tunnels=?, jump_hosts=?, auto_reconnect=?
      WHERE id=?
    `).run(
      p.name, p.host, p.port, p.username, p.identity_file, p.extra_args,
      p.tunnels    ? JSON.stringify(p.tunnels)    : null,
      p.jump_hosts ? JSON.stringify(p.jump_hosts) : null,
      p.auto_reconnect ? 1 : 0,
      p.id
    )
    return decodeProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(p.id))
  })

  ipcMain.handle('profile:delete', (_, id) => {
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  })

  // Window
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized())   mainWindow.unmaximize()
    else if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
    else mainWindow.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())

  ipcMain.handle('win:setOpacity', (_, v) => {
    const opacity = Math.max(0.3, Math.min(1.0, Number(v) || 1.0))
    mainWindow?.setOpacity(opacity)
    return opacity
  })

  ipcMain.handle('win:setAlwaysOnTop', (_, on) => {
    mainWindow?.setAlwaysOnTop(!!on)
    return !!on
  })

  ipcMain.handle('win:setBlur', (_, material) => {
    try {
      const m = ['mica','acrylic','tabbed'].includes(material) ? material : 'none'
      mainWindow?.setBackgroundMaterial?.(m)
      return m
    } catch (e) { return 'none' }
  })

  // Cached app icon for dialogs
  const dialogIconPath = join(__dirname, '../../build/icon.png')
  let dialogIcon = null
  try { dialogIcon = nativeImage.createFromPath(dialogIconPath) } catch {}

  // Confirmation dialog (blocking) — used for multi-tab close + paste-size warnings
  ipcMain.handle('confirm', (_, { message, detail, defaultId = 1, danger = false } = {}) => {
    const r = dialog.showMessageBoxSync(mainWindow, {
      type: danger ? 'warning' : 'question',
      buttons: ['Cancel', 'OK'],
      defaultId,
      cancelId: 0,
      message: message || 'Are you sure?',
      detail: detail || '',
      icon: dialogIcon || undefined,
      title: 'NexTerm',
      noLink: true
    })
    return r === 1
  })

  // Info / success / error dialog
  ipcMain.handle('info', (_, { message, detail, type = 'info' } = {}) => {
    dialog.showMessageBoxSync(mainWindow, {
      type, // 'none' | 'info' | 'warning' | 'error' | 'question'
      buttons: ['OK'],
      defaultId: 0,
      message: message || '',
      detail: detail || '',
      icon: dialogIcon || undefined,
      title: 'NexTerm',
      noLink: true
    })
  })

  // Shell
  ipcMain.on('shell:open', (_, url) => shell.openExternal(url))

  // ─── Session record / replay (asciinema v2 format) ──────────────────────
  ipcMain.handle('record:start', async (_, { paneId, cols = 80, rows = 24 } = {}) => {
    if (!paneId) return { ok: false, error: 'No paneId' }
    if (recordings.has(paneId)) return { ok: false, error: 'Already recording' }
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Save terminal recording',
      defaultPath: `nexterm-${new Date().toISOString().replace(/[:.]/g, '-')}.cast`,
      filters: [{ name: 'asciinema cast', extensions: ['cast'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false }
    try {
      const fd = createWriteStream(r.filePath, { flags: 'w' })
      // asciinema v2 header
      fd.write(JSON.stringify({
        version: 2,
        width:  cols,
        height: rows,
        timestamp: Math.floor(Date.now() / 1000),
        env: { SHELL: '/bin/sh', TERM: 'xterm-256color' }
      }) + '\n')
      recordings.set(paneId, { fd, startTs: Date.now(), path: r.filePath })
      return { ok: true, path: r.filePath }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('record:stop', (_, { paneId } = {}) => {
    const rec = recordings.get(paneId)
    if (!rec) return { ok: false, error: 'Not recording' }
    try { rec.fd.end() } catch {}
    recordings.delete(paneId)
    return { ok: true, path: rec.path }
  })

  ipcMain.handle('record:status', (_, { paneId } = {}) => ({
    recording: recordings.has(paneId)
  }))

  // Open and parse a .cast file → returns { width, height, events: [{t, data}] }
  ipcMain.handle('replay:open', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Open terminal recording',
      properties: ['openFile'],
      filters: [{ name: 'asciinema cast', extensions: ['cast', 'json'] }, { name: 'All', extensions: ['*'] }]
    })
    if (r.canceled || !r.filePaths?.[0]) return { ok: false }
    try {
      const txt = readFileSync(r.filePaths[0], 'utf8')
      const lines = txt.split(/\r?\n/).filter(Boolean)
      const header = JSON.parse(lines[0])
      const events = []
      for (let i = 1; i < lines.length; i++) {
        try {
          const e = JSON.parse(lines[i])
          if (Array.isArray(e) && e[1] === 'o') events.push({ t: e[0], data: e[2] })
        } catch {}
      }
      return { ok: true, file: r.filePaths[0], width: header.width || 80, height: header.height || 24, events }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // ─── Workspace file (.nexterm.yml) ────────────────────────────────────────
  // Reads .nexterm.yml from a directory and returns parsed tabs.
  // Format:
  //   tabs:
  //     - name: Server
  //       cwd:  ./server         # optional, relative to file
  //       command: npm run dev   # optional, runs after spawn
  //       shell: pwsh.exe        # optional override
  ipcMain.handle('workspace:load', async (_, dir) => {
    if (!dir) return { ok: false, error: 'No dir' }
    const candidates = [
      join(dir, '.nexterm.yml'),
      join(dir, '.nexterm.yaml'),
      join(dir, 'nexterm.yml')
    ]
    const file = candidates.find(p => existsSync(p))
    if (!file) return { ok: false, error: 'No .nexterm.yml in this folder' }
    try {
      const doc = yaml.load(readFileSync(file, 'utf8'))
      const out = (doc?.tabs || []).map(t => ({
        name:    t.name || 'Tab',
        cwd:     t.cwd  ? join(dir, t.cwd) : dir,
        shell:   t.shell || null,
        command: t.command || null
      }))
      return { ok: true, tabs: out, file }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // ─── Live system load (for the bottom status bar bars) ────────────────────
  // Renderer polls this every ~2s. Reads CPU from a 200ms sample, GPU from
  // nvidia-smi (when available), RAM from os.* (instant).
  ipcMain.handle('system:load', async () => {
    const ramT = os.totalmem(), ramU = ramT - os.freemem()
    const ramPct = ramT > 0 ? Math.round((ramU / ramT) * 100) : 0
    // Use the same samplers as the banner widget cache so we don't duplicate.
    const [cpuPct, gpuPct] = await Promise.all([sampleCpuPct(120), sampleGpuPct()])
    return { cpu: cpuPct, gpu: gpuPct, ram: ramPct }
  })

  // ─── Link preview (HEAD/GET <title>) for hover cards ─────────────────────
  // Cached briefly so repeated hovers don't re-fetch the same page.
  const linkCache = new Map()  // url → { ts, title }
  ipcMain.handle('link:preview', async (_, url) => {
    if (!url) return { title: null }
    const cached = linkCache.get(url)
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return { title: cached.title }
    try {
      const u = new URL(url)
      if (!/^https?:$/.test(u.protocol)) return { title: null }
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'NexTerm/0.1' }
      })
      const text = (await res.text()).slice(0, 8192)
      const m = text.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = m ? m[1].trim().slice(0, 200) : null
      linkCache.set(url, { ts: Date.now(), title })
      return { title }
    } catch (e) {
      linkCache.set(url, { ts: Date.now(), title: null })
      return { title: null, error: String(e?.message || e) }
    }
  })

  // ─── Save scrollback to file ──────────────────────────────────────────────
  ipcMain.handle('dialog:saveScrollback', async (_, text) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Save terminal output',
      defaultPath: `nexterm-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
      filters: [{ name: 'Text', extensions: ['txt', 'log'] }, { name: 'All files', extensions: ['*'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false }
    try {
      writeFileSync(r.filePath, String(text || ''), 'utf8')
      return { ok: true, path: r.filePath }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // ─── Git info for status bar ──────────────────────────────────────────────
  // Cached briefly so the status bar doesn't shell out on every render.
  const gitCache = new Map()  // path → { ts, info }
  ipcMain.handle('git:info', async (_, path) => {
    if (!path) return { branch: null, dirty: false }
    const cached = gitCache.get(path)
    if (cached && Date.now() - cached.ts < 2000) return cached.info
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: path, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
      }).toString().trim()
      let dirty = false
      try {
        const out = execSync('git status --porcelain', {
          cwd: path, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
        }).toString().trim()
        dirty = out.length > 0
      } catch {}
      const info = { branch, dirty }
      gitCache.set(path, { ts: Date.now(), info })
      return info
    } catch {
      const info = { branch: null, dirty: false }
      gitCache.set(path, { ts: Date.now(), info })
      return info
    }
  })

  // ─── Quake mode (slide-down window) ───────────────────────────────────────
  let quakeOriginalBounds = null
  function positionAsQuake(heightPct) {
    if (!mainWindow) return
    if (!quakeOriginalBounds) quakeOriginalBounds = mainWindow.getBounds()
    const display = screen.getPrimaryDisplay()
    const { x, y, width, height } = display.workArea
    const h = Math.max(200, Math.round(height * (heightPct / 100)))
    mainWindow.setBounds({ x, y, width, height: h }, false)
    mainWindow.setAlwaysOnTop(true)
  }
  function toggleQuakeWindow() {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      const s = loadSettings()
      if (s.quakeMode) positionAsQuake(s.quakeHeight ?? 50)
      mainWindow.show()
      mainWindow.focus()
    }
  }
  function registerQuakeShortcut(hotkey) {
    try { globalShortcut.unregisterAll() } catch {}
    if (!hotkey) return false
    try { return globalShortcut.register(hotkey, toggleQuakeWindow) } catch { return false }
  }
  ipcMain.handle('quake:apply', (_, { enabled, hotkey, heightPct } = {}) => {
    if (enabled) {
      const ok = registerQuakeShortcut(hotkey || 'Ctrl+Shift+Q')
      if (heightPct) positionAsQuake(heightPct)
      return { ok }
    } else {
      try { globalShortcut.unregisterAll() } catch {}
      if (quakeOriginalBounds && mainWindow) {
        try { mainWindow.setBounds(quakeOriginalBounds, false) } catch {}
        quakeOriginalBounds = null
        mainWindow.setAlwaysOnTop(loadSettings().alwaysOnTop === true)
      }
      return { ok: true }
    }
  })

  // ─── Explorer "Open NexTerm here" context menu ────────────────────────────
  // Adds entries under HKCU\Software\Classes\Directory\shell\NexTerm and
  // ...\Background\shell\NexTerm so the context menu works on folders AND
  // inside an open folder. Per-user only — no admin needed.
  // Find the installed NexTerm.exe. When packaged, process.execPath IS that
  // path. In dev mode process.execPath = electron.exe, which the registry
  // mustn't capture (Explorer would invoke it with a folder arg, and Electron
  // would try to load the folder as a JS app — confusing failure).
  function getInstalledExePath() {
    if (app.isPackaged) return process.execPath
    const candidates = [
      join(process.env.LOCALAPPDATA || '', 'Programs', 'NexTerm', 'NexTerm.exe'),
      'C:\\Program Files\\NexTerm\\NexTerm.exe',
      'C:\\Program Files (x86)\\NexTerm\\NexTerm.exe'
    ]
    for (const p of candidates) {
      if (p && existsSync(p)) return p
    }
    return null
  }
  ipcMain.handle('explorer:installContextMenu', async () => {
    const exe = getInstalledExePath()
    if (!exe) {
      return {
        ok: false,
        error: 'NexTerm.exe not found.\nInstall NexTerm from the Setup .exe first, then enable this from the installed app (not from `npm run dev`).'
      }
    }
    const iconPath = exe
    const cmdShell = `"${exe}" "%V"`
    const cmdBg    = `"${exe}" "%V"`
    const reg = (cmd) => new Promise((resolve) => {
      const p = cpSpawn('reg.exe', cmd, { stdio: 'ignore', windowsHide: true })
      p.on('exit', code => resolve(code === 0))
      p.on('error', () => resolve(false))
    })
    const cmds = [
      ['add', 'HKCU\\Software\\Classes\\Directory\\shell\\NexTerm',          '/ve', '/d', 'Open in NexTerm', '/f'],
      ['add', 'HKCU\\Software\\Classes\\Directory\\shell\\NexTerm',          '/v', 'Icon', '/d', iconPath, '/f'],
      ['add', 'HKCU\\Software\\Classes\\Directory\\shell\\NexTerm\\command', '/ve', '/d', cmdShell, '/f'],
      ['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\NexTerm',          '/ve', '/d', 'Open in NexTerm', '/f'],
      ['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\NexTerm',          '/v', 'Icon', '/d', iconPath, '/f'],
      ['add', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\NexTerm\\command', '/ve', '/d', cmdBg, '/f']
    ]
    for (const args of cmds) {
      const ok = await reg(args)
      if (!ok) return { ok: false, error: 'reg.exe failed' }
    }
    return { ok: true }
  })
  ipcMain.handle('explorer:uninstallContextMenu', async () => {
    const reg = (args) => new Promise((resolve) => {
      const p = cpSpawn('reg.exe', args, { stdio: 'ignore', windowsHide: true })
      p.on('exit', () => resolve(true))
      p.on('error', () => resolve(true))
    })
    await reg(['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\NexTerm', '/f'])
    await reg(['delete', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\NexTerm', '/f'])
    return { ok: true }
  })

  // ─── Native notification (fallback for the renderer Notification API) ──────
  ipcMain.handle('notify:show', (_, { title, body, silent } = {}) => {
    try {
      const n = new Notification({ title: title || 'NexTerm', body: body || '', silent: !!silent, icon: dialogIcon })
      n.show()
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })

  // ─── SFTP ─────────────────────────────────────────────────────────────────
  // One ssh2 Client + SFTP wrapper per connection id (returned to renderer).
  const sftpConns = new Map()  // connId → { client, sftp }
  let sftpCounter = 0

  function readKey(file) {
    try { return readFileSync(file) } catch { return null }
  }

  ipcMain.handle('sftp:connect', async (_, profile) => {
    if (!profile?.host) return { ok: false, error: 'Missing host' }
    const client = new SshClient()
    return await new Promise((resolve) => {
      const cleanup = (err) => {
        try { client.end() } catch {}
        resolve({ ok: false, error: String(err?.message || err || 'connection failed') })
      }
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) return cleanup(err)
          sftpCounter++
          const connId = `sftp-${sftpCounter}`
          sftpConns.set(connId, { client, sftp })
          client.on('end',   () => sftpConns.delete(connId))
          client.on('close', () => sftpConns.delete(connId))
          resolve({ ok: true, connId })
        })
      })
      client.on('error', cleanup)
      try {
        const opts = {
          host:     profile.host,
          port:     profile.port || 22,
          username: profile.username || os.userInfo().username,
          readyTimeout: 15000
        }
        if (profile.identity_file) {
          const key = readKey(profile.identity_file)
          if (key) opts.privateKey = key
        }
        if (profile.password) opts.password = profile.password
        // Honor jump hosts via OpenSSH? ssh2 doesn't natively chain — for now
        // we connect direct. Users with bastions can still SSH manually in the
        // tab; SFTP just hits the destination directly.
        client.connect(opts)
      } catch (e) { cleanup(e) }
    })
  })

  ipcMain.handle('sftp:list', async (_, { connId, path = '.' } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    return await new Promise((resolve) => {
      c.sftp.readdir(path, (err, list) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        const entries = list.map(e => ({
          name: e.filename,
          longname: e.longname,
          size: e.attrs?.size ?? 0,
          mtime: e.attrs?.mtime ?? 0,
          isDir: e.attrs?.isDirectory?.() ?? false
        })).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
        resolve({ ok: true, entries })
      })
    })
  })

  ipcMain.handle('sftp:realpath', async (_, { connId, path = '.' } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    return await new Promise((resolve) => {
      c.sftp.realpath(path, (err, abs) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        resolve({ ok: true, path: abs })
      })
    })
  })

  ipcMain.handle('sftp:download', async (_, { connId, remotePath } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Download to…',
      defaultPath: remotePath.split('/').pop() || 'download'
    })
    if (r.canceled || !r.filePath) return { ok: false }
    return await new Promise((resolve) => {
      c.sftp.fastGet(remotePath, r.filePath, (err) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        resolve({ ok: true, path: r.filePath })
      })
    })
  })

  ipcMain.handle('sftp:upload', async (_, { connId, remoteDir, localPath } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    let local = localPath
    if (!local) {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Upload file', properties: ['openFile']
      })
      if (r.canceled || !r.filePaths?.[0]) return { ok: false }
      local = r.filePaths[0]
    }
    const name = local.replace(/\\/g, '/').split('/').pop()
    const remote = (remoteDir.endsWith('/') ? remoteDir : remoteDir + '/') + name
    return await new Promise((resolve) => {
      c.sftp.fastPut(local, remote, (err) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        resolve({ ok: true, path: remote })
      })
    })
  })

  ipcMain.handle('sftp:delete', async (_, { connId, path, isDir } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    return await new Promise((resolve) => {
      const fn = isDir ? c.sftp.rmdir.bind(c.sftp) : c.sftp.unlink.bind(c.sftp)
      fn(path, (err) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        resolve({ ok: true })
      })
    })
  })

  ipcMain.handle('sftp:rename', async (_, { connId, oldPath, newPath } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: false, error: 'No connection' }
    return await new Promise((resolve) => {
      c.sftp.rename(oldPath, newPath, (err) => {
        if (err) return resolve({ ok: false, error: String(err?.message || err) })
        resolve({ ok: true })
      })
    })
  })

  ipcMain.handle('sftp:disconnect', (_, { connId } = {}) => {
    const c = sftpConns.get(connId)
    if (!c) return { ok: true }
    try { c.client.end() } catch {}
    sftpConns.delete(connId)
    return { ok: true }
  })

  // ─── WSL ──────────────────────────────────────────────────────────────────
  // List installed WSL distributions. wsl.exe outputs UTF-16-LE with a header
  // line ("Windows Subsystem for Linux Distributions:") so we strip those.
  ipcMain.handle('wsl:list', async () => {
    if (!shellExists('wsl.exe')) return { available: false, distros: [] }
    return await new Promise(resolve => {
      const ps = cpSpawn('wsl.exe', ['--list', '--quiet'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      const chunks = []
      ps.stdout.on('data', c => chunks.push(c))
      ps.on('error',  () => resolve({ available: true, distros: [], error: 'spawn failed' }))
      ps.on('close',  () => {
        // wsl --list outputs UTF-16-LE
        const raw = Buffer.concat(chunks).toString('utf16le')
        const distros = raw
          .split(/\r?\n/)
          .map(l => l.replace(/ /g, '').trim())
          .filter(l => l && !/^Windows Subsystem/i.test(l))
        resolve({ available: true, distros })
      })
    })
  })

  // Install a Linux package (e.g. zsh, fish) inside the active WSL distro.
  // Respawns the dead pty in the same pane so the user sees live apt output and
  // can answer the sudo password prompt right there.
  ipcMain.handle('wsl:installShell', async (_, { shell: shellName, paneId } = {}) => {
    if (!shellName || !/^[a-z0-9-]+$/i.test(shellName)) {
      return { ok: false, error: 'Invalid shell name' }
    }
    try {
      const old = ptys.get(paneId)
      if (old) { try { old.kill() } catch {} ; ptys.delete(paneId) }
    } catch {}
    try {
      const banner = `echo '[NexTerm] Installing ${shellName} inside WSL — you may be asked for your sudo password.'`
      const done   = `echo ''; echo '[NexTerm] ${shellName} installed. Close this tab and open a new ${shellName} tab to use it.'`
      const cmd = `${banner} && sudo apt update && sudo apt install -y ${shellName} && ${done}`
      createPty(paneId, 'wsl.exe', undefined, 80, 24, ['-e', 'bash', '-c', cmd])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Install a distro by name. Streams stdout/stderr into the given pane id so
  // the user sees live progress in the same terminal where the error appeared.
  ipcMain.handle('wsl:install', async (_, { distro, paneId } = {}) => {
    if (!distro) return { ok: false, error: 'No distro specified' }
    // Kill any existing pty for this pane (it's the dead WSL one)
    try {
      const old = ptys.get(paneId)
      if (old) { try { old.kill() } catch {} ; ptys.delete(paneId) }
    } catch {}
    // Spawn a fresh PowerShell pty in the same pane that auto-runs the install
    try {
      const cmd = `wsl --install -d ${distro}`
      const ps = `Write-Host "Installing $('${distro}') ..." -ForegroundColor Cyan; ${cmd}`
      createPty(paneId, 'powershell.exe', undefined, 80, 24, ['-NoLogo', '-NoExit', '-Command', ps])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // Context menu
  ipcMain.on('ctx:show', (_, { tabId, selection } = {}) => {
    const sel = (selection || '').trim()
    const truncated = sel.length > 40 ? sel.slice(0, 37) + '…' : sel
    const items = [
      { label: 'Copy',       click: () => safeSend('ctx:action', { action: 'copy', tabId }) },
      { label: 'Paste',      click: () => safeSend('ctx:action', { action: 'paste', tabId }) }
    ]
    if (sel) {
      items.push({ type: 'separator' })
      items.push({
        label: `Search web for "${truncated}"`,
        click: () => {
          const settings = loadSettings()
          const url = (settings.searchUrl || 'https://www.google.com/search?q=') + encodeURIComponent(sel)
          shell.openExternal(url)
        }
      })
    }
    items.push(
      { type: 'separator' },
      { label: 'Split Right', click: () => safeSend('ctx:action', { action: 'splitRow', tabId }) },
      { label: 'Split Down',  click: () => safeSend('ctx:action', { action: 'splitCol', tabId }) },
      { label: 'Close Pane',  click: () => safeSend('ctx:action', { action: 'closePane', tabId }) },
      { type: 'separator' },
      recordings.has(tabId)
        ? { label: 'Stop Recording',  click: () => safeSend('ctx:action', { action: 'recordStop',  tabId }) }
        : { label: 'Start Recording…', click: () => safeSend('ctx:action', { action: 'recordStart', tabId }) },
      { label: 'Replay File…',  click: () => safeSend('ctx:action', { action: 'replayOpen', tabId }) },
      { type: 'separator' },
      { label: 'Clear',      click: () => safeSend('ctx:action', { action: 'clear', tabId }) },
      { label: 'Select All', click: () => safeSend('ctx:action', { action: 'selectAll', tabId }) }
    )
    Menu.buildFromTemplate(items).popup({ window: mainWindow })
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

const SIZE_PRESETS = {
  small:  { width: 800,  height: 500 },
  medium: { width: 1280, height: 800 },
  large:  { width: 1600, height: 900 }
}

// Background color of each theme — used to set BrowserWindow backgroundColor
// before the renderer loads, so the user never sees a white flash on startup.
const THEME_BG = {
  tokyonight: '#1a1b26', dracula: '#282a36', nord: '#2e3440',
  catppuccin: '#1e1e2e', gruvbox: '#282828',
  solarizedDark: '#002b36', solarizedLight: '#fdf6e3',
  monokai: '#272822', oneDark: '#282c34', synthwave: '#2b213a',
  ayuDark: '#0b0e14', ayuMirage: '#1f2430',
  githubDark: '#0d1117', githubLight: '#ffffff',
  rosePine: '#191724', materialOcean: '#0f111a',
  cyberpunk: '#000b1e', everforest: '#2d353b',
  light: '#fafafa'
}

function createWindow() {
  const settings = loadSettings()
  const themeBg = THEME_BG[settings.theme] || '#1a1b26'
  let { width, height } = SIZE_PRESETS.medium
  const preset = settings.launchSizePreset || 'medium'
  if (preset === 'custom') {
    width  = settings.launchWidth  || 1280
    height = settings.launchHeight || 800
  } else if (SIZE_PRESETS[preset]) {
    width  = SIZE_PRESETS[preset].width
    height = SIZE_PRESETS[preset].height
  }

  // ALWAYS opaque — `transparent:true` makes Windows treat the window as a
  // layered window which kills Win11 rounded corners, native dblclick→maximize,
  // snap layouts, and smooth animations. None of our visuals require it:
  //   - background image: rendered as a CSS layer in the renderer
  //   - blur: setBackgroundMaterial works on opaque windows
  //   - opacity: setOpacity works on opaque windows
  const needsTransparent = false
  console.log(`[createWindow] needsTransparent=${needsTransparent} blur=${settings.windowBlur} opacity=${settings.terminalOpacity}`)

  mainWindow = new BrowserWindow({
    width, height,
    minWidth: 500, minHeight: 350,
    // titleBarStyle:'hidden' keeps OS-managed window frame (smooth maximize
    // animations, native dblclick→maximize, native snap layouts, Win11 rounded
    // corners) but hides the OS title-bar UI so we can put our custom one on
    // top. Critical: no titleBarOverlay → OS controls overlay stays hidden.
    titleBarStyle: 'hidden',
    transparent: needsTransparent,
    hasShadow: true,
    backgroundColor: needsTransparent ? '#00' + themeBg.slice(1) : themeBg,
    ...(needsTransparent && settings.windowBlur && settings.windowBlur !== 'none'
      ? { backgroundMaterial: settings.windowBlur } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    title: 'NexTerm',
    icon: join(__dirname, '../../build/icon.png')
  })

  // Tell the renderer when the window changes maximized state — so it can
  // strip the rounded edge / shadow padding that only makes sense when floating.
  const broadcastMaxState = () => {
    safeSend('win:maximized', mainWindow.isMaximized())
  }
  mainWindow.on('maximize',   broadcastMaxState)
  mainWindow.on('unmaximize', broadcastMaxState)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (preset === 'max') mainWindow.maximize()
    const op = settings.terminalOpacity
    if (typeof op === 'number' && op < 1.0) mainWindow.setOpacity(Math.max(0.3, Math.min(1.0, op)))
    if (settings.alwaysOnTop === true) mainWindow.setAlwaysOnTop(true)
    broadcastMaxState()
    // Re-apply blur material — sometimes needs to be set after ready-to-show on Windows
    try {
      const isOsMaterial = ['mica','acrylic','tabbed'].includes(settings.windowBlur)
      mainWindow.setBackgroundMaterial?.(isOsMaterial ? settings.windowBlur : 'none')
    } catch {}
    // Force Win11 rounded corners. Most Win11 builds auto-round titleBarStyle:'hidden'
    // windows, but some don't unless we explicitly set DWMWA_WINDOW_CORNER_PREFERENCE = ROUND (2).
    try { setCornerPreference(mainWindow, 2) } catch (e) { console.error('[corners]', e?.message) }
  })

  // If "Run in Background" is on, intercept the close event and hide the window
  // instead of destroying it. The user can still quit via win-all-closed.
  mainWindow.on('close', (e) => {
    const s = loadSettings()
    if (s.runInBackground === true && !global.__forceQuit) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  setupIPC()

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDB()
  // Match the native UI (dialogs, menus, scroll bars) to the user's chosen theme
  try {
    const s = loadSettings()
    const themeBg = THEME_BG[s.theme] || '#1a1b26'
    // Light themes have bg starting with f/e/d (very light); everything else = dark
    const isLight = /^#[fed]/i.test(themeBg)
    nativeTheme.themeSource = isLight ? 'light' : 'dark'
  } catch {}
  // One-time validation: if defaultShell is unusable, repair to a working one
  try {
    const s = loadSettings()
    if (s.defaultShell && !shellExists(s.defaultShell)) {
      const ok = detectDefaultShell()
      console.warn(`[startup] defaultShell "${s.defaultShell}" not found — saving "${ok}"`)
      s.defaultShell = ok
      saveSettings(s)
    }
    app.setLoginItemSettings({
      openAtLogin: s.launchOnStartup === true,
      path: process.execPath,
      args: []
    })
  } catch {}
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Kick off widget cache refresh in background. First refresh is fire-and-forget
  // so the first banner shows widgets after a few seconds rather than blocking startup.
  refreshWidgetCache().catch(() => {})
  setInterval(() => { refreshWidgetCache().catch(() => {}) }, 5 * 60 * 1000)
})

app.on('window-all-closed', () => {
  for (const pty of ptys.values()) {
    try { pty.kill() } catch {}
  }
  db?.close()
  if (process.platform !== 'darwin') app.quit()
})
