// Ollama lifecycle: detect installation, check daemon, list local models, start.

import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export const OLLAMA_BASE = 'http://localhost:11434'

// Parse the version number from `ollama --version` output. When the daemon is
// offline, Ollama prints noisy warnings ("Warning: could not connect to a
// running Ollama instance" + "Warning: client version is 0.23.1") in addition
// to (or instead of) the normal "ollama version is 0.23.1" line. We just pull
// the first X.Y.Z we see.
function parseOllamaVersion(raw) {
  if (!raw) return null
  const m = raw.match(/\b(\d+\.\d+\.\d+)\b/)
  return m ? m[1] : null
}

export function detectOllama() {
  // First try `ollama --version` from PATH. Combine stdout + stderr because
  // Ollama writes warnings to stderr when the daemon isn't reachable.
  try {
    const out = execSync('ollama --version 2>&1', {
      encoding: 'utf8', windowsHide: true, timeout: 2500, shell: true
    }).trim()
    const version = parseOllamaVersion(out)
    if (version) return { installed: true, version, source: 'path' }
  } catch (e) {
    // Even on non-zero exit, stderr may still have a version line — try parsing
    const stderr = e?.stderr?.toString?.() || ''
    const stdout = e?.stdout?.toString?.() || ''
    const v = parseOllamaVersion(stdout + '\n' + stderr)
    if (v) return { installed: true, version: v, source: 'path' }
  }

  // Fallback: well-known install locations on Windows
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe'
    ]
    for (const p of candidates) {
      if (p && existsSync(p)) return { installed: true, source: 'found', path: p }
    }
  }
  return { installed: false }
}

export async function isOllamaRunning() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch(OLLAMA_BASE + '/api/tags', { signal: ctrl.signal })
    clearTimeout(timer)
    return r.ok
  } catch {
    return false
  }
}

// Start the Ollama daemon as a detached background process. Returns once we
// can reach the API (or after timeoutMs gives up).
export async function startOllama({ timeoutMs = 10_000 } = {}) {
  // Already running?
  if (await isOllamaRunning()) return { ok: true, alreadyRunning: true }

  const info = detectOllama()
  if (!info.installed) return { ok: false, error: 'Ollama is not installed' }

  // Prefer the installer's tray app so the icon appears like normal — falls
  // back to "ollama serve" if the GUI app isn't found.
  const localApp = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama app.exe')
    : null

  try {
    if (localApp && existsSync(localApp)) {
      spawn(localApp, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    } else {
      const cmd = info.path || 'ollama'
      spawn(cmd, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }

  // Poll until the API responds (or timeout)
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isOllamaRunning()) return { ok: true, alreadyRunning: false }
    await new Promise(r => setTimeout(r, 500))
  }
  return { ok: false, error: 'Started Ollama but daemon did not respond in time' }
}

export async function listLocalModels() {
  try {
    const r = await fetch(OLLAMA_BASE + '/api/tags', { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return []
    const data = await r.json()
    return (data.models || []).map(m => ({
      name:        m.name,
      sizeBytes:   m.size,
      sizeGb:      +(m.size / 1024 ** 3).toFixed(2),
      modifiedAt:  m.modified_at,
      family:      m.details?.family,
      parameters:  m.details?.parameter_size
    }))
  } catch {
    return []
  }
}
