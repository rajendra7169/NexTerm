// In-process local AI backend powered by node-llama-cpp.
//
// Unlike Ollama, this engine runs entirely INSIDE the NexTerm process:
// no separate daemon, no version mismatch when Ollama updates, nothing to
// install or start. The user picks a model from a curated list, NexTerm
// downloads the GGUF file once, and inference runs from then on.
//
// Public API:
//   listAvailableModels()          → catalog with download state
//   detectRecommendedModel()       → which tier suits this machine
//   downloadModel(id, onProgress)  → fetch the GGUF file
//   removeModel(id)                → delete the downloaded file
//   loadModel(id)                  → ready it for inference
//   complete({prompt, system, signal}) → async non-streaming
//   * streamComplete({...})        → async generator yielding chunks

import { app } from 'electron'
import { existsSync, mkdirSync, statSync, createWriteStream, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { detectGpu } from './hardware.js'

// node-llama-cpp is loaded lazily — the binary is ~20MB and we don't want to
// pay that cost on every NexTerm launch.
let llamaModule = null
let engineInstance = null         // a single Llama context for the loaded model
let loadedModelId = null

async function getLlama() {
  if (!llamaModule) llamaModule = await import('node-llama-cpp')
  return llamaModule
}

// Curated catalog of GGUF models. URLs point to HuggingFace and are direct
// downloads. Sizes are approximate.
export const MODEL_CATALOG = [
  {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen 2.5 Coder 1.5B',
    desc: 'Tiny + fast. Great for autocomplete and small Q&A. CPU-friendly.',
    sizeMB: 986,
    minRamGB: 4,
    file: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    url:  'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf?download=true'
  },
  {
    id: 'qwen2.5-coder-3b',
    name: 'Qwen 2.5 Coder 3B',
    desc: 'Small + capable. Good balance for coding chat on laptops.',
    sizeMB: 1929,
    minRamGB: 6,
    file: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    url:  'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf?download=true'
  },
  {
    id: 'qwen2.5-coder-7b',
    name: 'Qwen 2.5 Coder 7B',
    desc: 'Strong code model. Recommended for 16GB+ RAM systems.',
    sizeMB: 4683,
    minRamGB: 12,
    file: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    url:  'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf?download=true'
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B Instruct',
    desc: 'Meta\'s general-purpose model. Strong reasoning at 3B scale.',
    sizeMB: 2019,
    minRamGB: 6,
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url:  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true'
  }
]

function modelsDir() {
  const d = join(app.getPath('userData'), 'ai-models')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function modelPath(id) {
  const m = MODEL_CATALOG.find(m => m.id === id)
  if (!m) return null
  return join(modelsDir(), m.file)
}

export function listAvailableModels() {
  return MODEL_CATALOG.map(m => {
    const p = modelPath(m.id)
    let downloaded = false
    let actualSize = 0
    try {
      if (p && existsSync(p)) {
        actualSize = statSync(p).size
        downloaded = actualSize > 1024 * 1024  // sanity check: at least 1 MB
      }
    } catch {}
    return { ...m, downloaded, actualSize, loaded: loadedModelId === m.id }
  })
}

export async function detectRecommendedModel() {
  const ramGB = os.totalmem() / (1024 ** 3)
  let gpu = null
  try { gpu = await detectGpu() } catch {}
  const hasGoodGpu = gpu && /nvidia|amd|intel arc/i.test(String(gpu)) && !/integrated|hd graphics/i.test(String(gpu))
  // Pick the largest model that fits in RAM (with overhead) AND that the
  // catalog supports.
  const candidates = MODEL_CATALOG
    .filter(m => m.minRamGB <= ramGB)
    .sort((a, b) => b.minRamGB - a.minRamGB)
  const pick = candidates[0] || MODEL_CATALOG[0]
  return { recommendedId: pick.id, ramGB: Number(ramGB.toFixed(1)), gpu: String(gpu || 'unknown'), hasGoodGpu }
}

// In-flight downloads — keyed by model id. Allows cancel + resume.
const inflightDownloads = new Map()  // id → AbortController

export function cancelDownload(id) {
  const ctrl = inflightDownloads.get(id)
  if (ctrl) { try { ctrl.abort() } catch {} ; return { ok: true } }
  return { ok: false, error: 'No active download' }
}

export function getPartialSize(id) {
  const dest = modelPath(id)
  if (!dest) return 0
  const tmp = dest + '.partial'
  try { return existsSync(tmp) ? statSync(tmp).size : 0 } catch { return 0 }
}

export async function downloadModel(id, onProgress) {
  const m = MODEL_CATALOG.find(m => m.id === id)
  if (!m) throw new Error('Unknown model: ' + id)
  const dest = modelPath(id)
  if (existsSync(dest) && statSync(dest).size > 1024 * 1024) {
    return { ok: true, alreadyExists: true, path: dest }
  }
  const tmp = dest + '.partial'
  // Resume support — if a .partial exists, ask the server for a Range request.
  let resumeFrom = 0
  try { if (existsSync(tmp)) resumeFrom = statSync(tmp).size } catch {}

  const controller = new AbortController()
  inflightDownloads.set(id, controller)
  try {
    const headers = {}
    if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`
    const r = await fetch(m.url, { signal: controller.signal, headers })
    if (!r.ok && r.status !== 206) {
      // 416 means we already have it all; treat as success
      if (r.status === 416 && existsSync(tmp)) {
        const fs = await import('node:fs/promises')
        await fs.rename(tmp, dest)
        onProgress?.({ got: statSync(dest).size, total: statSync(dest).size, pct: 1 })
        return { ok: true, path: dest }
      }
      throw new Error(`Download failed: HTTP ${r.status}`)
    }
    const range = r.headers.get('content-range')
    let total = Number(r.headers.get('content-length') || (m.sizeMB * 1024 * 1024))
    if (range) {
      const match = range.match(/\/(\d+)$/)
      if (match) total = Number(match[1])
    } else if (resumeFrom > 0 && r.status !== 206) {
      // Server doesn't support range — restart from scratch
      resumeFrom = 0
      try { unlinkSync(tmp) } catch {}
    }
    const ws = createWriteStream(tmp, { flags: resumeFrom > 0 ? 'a' : 'w' })
    const reader = r.body.getReader()
    let got = resumeFrom
    let lastTick = Date.now()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        got += value.byteLength
        ws.write(Buffer.from(value))
        const now = Date.now()
        if (now - lastTick > 200) {
          lastTick = now
          try { onProgress?.({ got, total, pct: total > 0 ? got / total : 0 }) } catch {}
        }
      }
    } catch (e) {
      ws.end()
      if (controller.signal.aborted) {
        // Leave .partial in place so user can resume later
        throw new Error('cancelled')
      }
      throw e
    }
    ws.end()
    await new Promise(resolve => ws.on('finish', resolve))
    // After the network stream finishes, we still have to flush + rename a
    // multi-GB file. That can take several seconds — surface it as a distinct
    // "finalizing" state so the UI doesn't look stuck at 100%.
    onProgress?.({ got: total, total, pct: 1, status: 'finalizing' })
    const fs = await import('node:fs/promises')
    await fs.rename(tmp, dest)
    onProgress?.({ got: total, total, pct: 1, status: 'done' })
    return { ok: true, path: dest }
  } finally {
    inflightDownloads.delete(id)
  }
}

export function removeModel(id) {
  const p = modelPath(id)
  if (!p || !existsSync(p)) return { ok: false, error: 'Not downloaded' }
  if (loadedModelId === id) unloadModel()
  try { unlinkSync(p); return { ok: true } }
  catch (e) { return { ok: false, error: String(e?.message || e) } }
}

export async function loadModel(id) {
  if (loadedModelId === id && engineInstance) return { ok: true, alreadyLoaded: true }
  const p = modelPath(id)
  if (!p || !existsSync(p)) return { ok: false, error: 'Model not downloaded' }
  const lib = await getLlama()
  try {
    // Tear down any previously loaded model
    if (engineInstance) {
      try { await engineInstance.context?.dispose?.() } catch {}
      try { await engineInstance.model?.dispose?.() } catch {}
      engineInstance = null
    }
    // Initialize llama with explicit GPU auto-detection. Ollama does this
    // automatically — without it, node-llama-cpp may leave all layers in CPU
    // RAM even on systems with a perfectly capable GPU, which is the big
    // RAM-usage gap you'd see vs Ollama.
    const llama = await lib.getLlama({ gpu: 'auto' })
    console.log('[bundled-llama] backend:', llama.gpu, '| supported GPUs:', llama.supportsGpuOffloading)

    // Tuned for low RAM footprint to match Ollama's behavior:
    //  - gpuLayers: { fitContext } → offload as many layers as VRAM allows
    //    AFTER reserving room for the context. The layer count adapts to
    //    real VRAM headroom (will be e.g. 28/29 with a tight 6GB GPU).
    //  - useMmap: false → critical for low RAM. With mmap=true on Windows,
    //    the entire model file gets mapped into the process's virtual
    //    memory and counted as committed RAM, even though most layers now
    //    live on the GPU. Disabling mmap means the model is read into a
    //    temporary buffer, copied to GPU, and the buffer freed — only the
    //    few CPU-resident layers stay in RAM. This is what Ollama does.
    //  - useMlock: false → OS can page out unused weights
    //  - contextSize 2048 → matches Ollama's default for tight KV cache
    const model = await llama.loadModel({
      modelPath: p,
      gpuLayers: { fitContext: { contextSize: 2048, sequences: 1 } },
      useMmap: false,
      useMlock: false
    })
    console.log('[bundled-llama] model loaded — total layers:', model.fileInfo?.metadata?.['general.architecture'], '| GPU layers offloaded:', model.gpuLayers, '/', model.fileInsights?.totalLayers)
    // sequences: 1 — one slot is all we need; doubling it would double the
    // KV cache (~1 GB extra RAM for a 7B model). The "No sequences left"
    // error is handled by reusing one persistent sequence per model load.
    const context = await model.createContext({ contextSize: 2048, sequences: 1 })
    engineInstance = { llama, model, context }
    loadedModelId = id
    return { ok: true }
  } catch (e) {
    console.error('[bundled-llama] loadModel failed', e)
    return { ok: false, error: String(e?.message || e) }
  }
}

export function unloadModel() {
  try { engineInstance?.context?.dispose?.() } catch {}
  try { engineInstance?.model?.dispose?.() } catch {}
  engineInstance = null
  loadedModelId = null
}

export function getLoadedModel() {
  return loadedModelId
}

// Each prompt creates a fresh LlamaChatSession over its own sequence, then
// disposes both. Note that session.dispose() alone does NOT release the
// underlying sequence slot — we must call sequence.dispose() explicitly,
// otherwise the second prompt hits "No sequences left" with sequences=1.
async function withSession(systemPrompt, body) {
  const lib = await getLlama()
  const sequence = engineInstance.context.getSequence()
  const session = new lib.LlamaChatSession({
    contextSequence: sequence,
    systemPrompt: systemPrompt || undefined
  })
  try {
    return await body(session)
  } finally {
    try { await session.dispose() } catch {}
    try { await sequence.dispose() } catch {}
  }
}

export async function complete({ prompt, system, model, signal }) {
  // Ensure the requested model is loaded.
  const id = model || loadedModelId
  if (!id) throw new Error('No bundled model selected')
  if (loadedModelId !== id) {
    const lr = await loadModel(id)
    if (!lr.ok) throw new Error(lr.error || 'Could not load model')
  }
  return withSession(system, (session) => session.prompt(prompt, { signal }))
}

export async function* streamComplete({ prompt, system, model, signal }) {
  const id = model || loadedModelId
  if (!id) throw new Error('No bundled model selected')
  if (loadedModelId !== id) {
    const lr = await loadModel(id)
    if (!lr.ok) throw new Error(lr.error || 'Could not load model')
  }
  const lib = await getLlama()
  const sequence = engineInstance.context.getSequence()
  const session = new lib.LlamaChatSession({
    contextSequence: sequence,
    systemPrompt: system || undefined
  })
  // Async generator wrapper around onTextChunk
  const chunks = []
  let resolveChunk = null
  let done = false
  let error = null
  const pump = (text) => {
    chunks.push(text)
    if (resolveChunk) { const r = resolveChunk; resolveChunk = null; r() }
  }
  const finish = () => {
    done = true
    if (resolveChunk) { const r = resolveChunk; resolveChunk = null; r() }
  }
  session.prompt(prompt, {
    signal,
    onTextChunk: (t) => pump(t)
  }).then(finish).catch(e => { error = e; finish() })
  while (!done || chunks.length > 0) {
    if (signal?.aborted) break
    if (chunks.length > 0) {
      yield chunks.shift()
      continue
    }
    if (done) break
    await new Promise(r => { resolveChunk = r })
  }
  try { await session.dispose() } catch {}
  try { await sequence.dispose() } catch {}
  if (error) throw error
}

export async function testConnection() {
  if (!loadedModelId) return { ok: false, error: 'No model loaded' }
  return { ok: true }
}
