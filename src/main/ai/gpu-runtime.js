// GPU runtime download/extract/integration.
//
// NexTerm's "online" installer ships small (~80 MB) and does NOT bundle the
// 120-440 MB GPU DLLs that node-llama-cpp needs for CUDA/Vulkan acceleration.
// Instead, on first launch we detect the user's GPU vendor and download
// JUST the matching runtime — saving most users ~180 MB.
//
// The "offline" installer bundles every runtime and never reaches this
// module's download path; we still use the module's resolution helper to
// expose status to the UI.
//
// Resolution strategy:
//   1. If the runtime is bundled at install time (offline installer), the
//      DLL exists under `process.resourcesPath/app.asar.unpacked/node_modules
//      /@node-llama-cpp/<variant>/ggml-cuda.dll`. node-llama-cpp finds it
//      automatically via normal Node module resolution. Nothing to do.
//   2. Otherwise (online installer), we look in `userData/gpu-runtime/
//      node_modules/@node-llama-cpp/<variant>/`. The main process patches
//      `module.paths` at startup so this folder is on Node's search path,
//      and node-llama-cpp finds the package there.
//
// The downloader saves to a `.partial` file and renames on completion so a
// cancelled / crashed download doesn't leave a corrupt runtime in place.

import { app } from 'electron'
import { existsSync, createWriteStream, mkdirSync, unlinkSync, statSync, readdirSync, rmSync, renameSync, createReadStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import Module from 'node:module'

// Register the user's downloaded-runtime path on Node's module search list
// as a side effect of importing this file. Done as early as possible so
// node-llama-cpp (loaded lazily inside ai/bundled-llama.js) sees the path
// the first time it tries to resolve `@node-llama-cpp/win-x64-cuda-ext` etc.
//
// We use globalPaths (rather than mutating each module's `paths`) because
// it's checked as the last-resort fallback by Node's resolver — bundled
// runtimes still win, downloaded ones only kick in when nothing's there.
try {
  const p = join(app.getPath('userData'), 'gpu-runtime', 'node_modules')
  if (!Module.globalPaths.includes(p)) Module.globalPaths.unshift(p)
} catch (e) {
  console.warn('[gpu-runtime] module path patch failed:', e?.message || e)
}

// Where downloaded GPU runtimes live. Adding this to module.paths at app
// start lets node-llama-cpp find them via `require('@node-llama-cpp/...')`.
export function userRuntimeRoot() {
  return join(app.getPath('userData'), 'gpu-runtime')
}

export function userRuntimeNodeModules() {
  return join(userRuntimeRoot(), 'node_modules')
}

// All known runtime variants we serve via the online installer. Add new
// platform/vendor combinations here as we expand cross-platform support.
//
// `url` is filled in at request time using the current release tag — we
// host the zips alongside NexTerm-Setup-*.exe on the same GitHub release.
export const RUNTIMES = {
  cuda: {
    id: 'cuda',
    label: 'NVIDIA GPU (CUDA)',
    packageName: '@node-llama-cpp/win-x64-cuda-ext',
    zipName:     'nexterm-gpu-cuda-win-x64',
    sizeMb:      180,   // approximate compressed size
    platforms:   ['win32-x64']
  },
  vulkan: {
    id: 'vulkan',
    label: 'AMD/Intel GPU (Vulkan)',
    packageName: '@node-llama-cpp/win-x64-vulkan',
    zipName:     'nexterm-gpu-vulkan-win-x64',
    sizeMb:      80,
    platforms:   ['win32-x64']
  }
  // Future: { id: 'metal', packageName: '@node-llama-cpp/mac-arm64-metal' }
  // Future: { id: 'cuda-linux', packageName: '@node-llama-cpp/linux-x64-cuda' }
}

// Check whether a runtime is available — either bundled by the offline
// installer (in resourcesPath) OR previously downloaded (in userData).
export function isRuntimeInstalled(runtimeId) {
  const r = RUNTIMES[runtimeId]
  if (!r) return false
  return getInstalledRuntimePath(r) !== null
}

function getInstalledRuntimePath(runtime) {
  // Bundled at install time?
  if (process.resourcesPath) {
    const bundled = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', runtime.packageName)
    if (looksValid(bundled)) return { path: bundled, source: 'bundled' }
  }
  // Downloaded into userData?
  const downloaded = join(userRuntimeNodeModules(), runtime.packageName)
  if (looksValid(downloaded)) return { path: downloaded, source: 'downloaded' }
  return null
}

// A runtime folder is "valid" if it has a package.json AND at least one .dll.
// Defends against an aborted download that left only metadata.
function looksValid(dir) {
  if (!existsSync(dir)) return false
  if (!existsSync(join(dir, 'package.json'))) return false
  try {
    const files = readdirSync(dir)
    return files.some(f => /\.(dll|so|dylib)$/i.test(f))
  } catch { return false }
}

export function listRuntimesWithStatus() {
  return Object.values(RUNTIMES).map(r => {
    const info = getInstalledRuntimePath(r)
    return {
      id: r.id,
      label: r.label,
      packageName: r.packageName,
      sizeMb: r.sizeMb,
      installed: !!info,
      source: info?.source || null,
      path: info?.path || null
    }
  })
}

// Download a runtime zip + extract it under userData. `onProgress` receives
// { got, total, pct, status } updates so the renderer can show a progress bar.
//
// `version` selects which GitHub Release tag to fetch from — defaults to the
// current app version so each release has its own matched runtime bundle.
const inflight = new Map()   // runtimeId → AbortController

export async function installRuntime(runtimeId, { version, onProgress } = {}) {
  const r = RUNTIMES[runtimeId]
  if (!r) throw new Error(`Unknown runtime: ${runtimeId}`)
  if (isRuntimeInstalled(runtimeId)) return { ok: true, alreadyInstalled: true }

  const tag = version || ('v' + app.getVersion())
  const url = `https://github.com/rajendra7169/NexTerm/releases/download/${tag}/${r.zipName}-${tag}.zip`

  const root = userRuntimeRoot()
  const tmpZip = join(root, `${r.zipName}.partial.zip`)
  const finalDir = join(userRuntimeNodeModules(), r.packageName)

  mkdirSync(root, { recursive: true })

  const ctrl = new AbortController()
  inflight.set(runtimeId, ctrl)
  try {
    onProgress?.({ status: 'downloading', got: 0, total: r.sizeMb * 1024 * 1024, pct: 0 })
    const resp = await fetch(url, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`)
    const total = Number(resp.headers.get('content-length') || (r.sizeMb * 1024 * 1024))
    const ws = createWriteStream(tmpZip)
    const reader = resp.body.getReader()
    let got = 0
    let lastTick = Date.now()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      got += value.byteLength
      ws.write(Buffer.from(value))
      const now = Date.now()
      if (now - lastTick > 150) {
        lastTick = now
        try { onProgress?.({ status: 'downloading', got, total, pct: total ? got / total : 0 }) } catch {}
      }
    }
    ws.end()
    await new Promise(res => ws.on('finish', res))

    onProgress?.({ status: 'extracting', got: total, total, pct: 1 })
    // Wipe any stale partial install before extracting.
    try { rmSync(finalDir, { recursive: true, force: true }) } catch {}
    mkdirSync(dirname(finalDir), { recursive: true })

    await extractZip(tmpZip, dirname(finalDir))
    try { unlinkSync(tmpZip) } catch {}

    if (!isRuntimeInstalled(runtimeId)) {
      throw new Error('Extraction succeeded but DLL is missing — runtime zip may be malformed')
    }
    onProgress?.({ status: 'done', got: total, total, pct: 1 })
    return { ok: true, path: finalDir }
  } catch (e) {
    // Clean up so we don't leave a broken state behind.
    try { unlinkSync(tmpZip) } catch {}
    if (ctrl.signal.aborted) return { ok: false, cancelled: true }
    return { ok: false, error: String(e?.message || e) }
  } finally {
    inflight.delete(runtimeId)
  }
}

export function cancelInstall(runtimeId) {
  const ctrl = inflight.get(runtimeId)
  if (!ctrl) return { ok: false, error: 'No active download' }
  try { ctrl.abort() } catch {}
  return { ok: true }
}

export function uninstallRuntime(runtimeId) {
  const r = RUNTIMES[runtimeId]
  if (!r) throw new Error(`Unknown runtime: ${runtimeId}`)
  const dir = join(userRuntimeNodeModules(), r.packageName)
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
  return { ok: true }
}

// Extract a zip using PowerShell on Windows (no extra deps). For
// cross-platform we'd swap in a streaming zip lib later.
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const cmd = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
        windowsHide: true
      })
      let err = ''
      child.stderr.on('data', d => { err += d.toString() })
      child.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`Expand-Archive failed: ${err.trim() || 'exit code ' + code}`))
      })
      child.on('error', reject)
    } else {
      // Linux/Mac: use the `unzip` binary if present
      const child = spawn('unzip', ['-o', zipPath, '-d', destDir], { windowsHide: true })
      let err = ''
      child.stderr.on('data', d => { err += d.toString() })
      child.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`unzip failed: ${err.trim() || 'exit code ' + code}`))
      })
      child.on('error', reject)
    }
  })
}
