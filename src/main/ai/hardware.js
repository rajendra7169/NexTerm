// Hardware detection — reports CPU/RAM/GPU and recommends a model tier.
// Used by the AI Setup wizard and to pick a sensible default local model.

import os from 'os'
import { execSync } from 'child_process'

function detectNvidia() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { encoding: 'utf8', windowsHide: true, timeout: 2500 }
    )
    const [name, vramMb] = out.trim().split(',').map(s => s.trim())
    if (!name) return null
    return { name, vendor: 'nvidia', vramMb: parseInt(vramMb, 10) || 0 }
  } catch { return null }
}

function detectWmicGpu() {
  if (process.platform !== 'win32') return null
  try {
    const out = execSync(
      'wmic path win32_VideoController get name,AdapterRAM /format:list',
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    )
    const blocks = out.split(/\r?\n\r?\n/).filter(Boolean)
    let best = null
    for (const block of blocks) {
      const fields = {}
      for (const line of block.split(/\r?\n/)) {
        const eq = line.indexOf('=')
        if (eq > 0) fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
      if (!fields.Name) continue
      const name = fields.Name
      const vramMb = fields.AdapterRAM
        ? Math.round(parseInt(fields.AdapterRAM, 10) / (1024 * 1024))
        : 0
      const vendor = /nvidia/i.test(name) ? 'nvidia'
                   : /amd|radeon/i.test(name) ? 'amd'
                   : /intel/i.test(name) ? 'intel' : 'unknown'
      const gpu = { name, vendor, vramMb }
      // Prefer NVIDIA → AMD → Intel
      if (!best
        || (vendor === 'nvidia' && best.vendor !== 'nvidia')
        || (vendor === 'amd' && best.vendor === 'intel')) {
        best = gpu
      }
    }
    return best
  } catch { return null }
}

export function detectGpu() {
  return detectNvidia() || detectWmicGpu()
}

export function detectHardware() {
  const cpus = os.cpus() || []
  return {
    cpu: {
      model:    cpus[0]?.model || 'Unknown',
      cores:    cpus.length,
      speedGhz: cpus[0]?.speed ? +(cpus[0].speed / 1000).toFixed(1) : 0
    },
    ram: {
      totalGb: +(os.totalmem() / 1024 ** 3).toFixed(1),
      freeGb:  +(os.freemem()  / 1024 ** 3).toFixed(1)
    },
    gpu:      detectGpu(),
    platform: process.platform,
    arch:     process.arch
  }
}

// Map hardware → model tier recommendation.
// Tiers correspond to the doc: S/A premium, B/C usable, D limited, cloud-only.
export function recommendTier(hw) {
  const ramGb  = hw.ram.totalGb
  const vramGb = (hw.gpu?.vramMb || 0) / 1024

  if (vramGb >= 8) return {
    tier: 'S', label: 'Premium',
    model: 'qwen2.5-coder:7b', sizeGb: 4.7,
    expectedSpeed: '40-60 tok/s',
    note: 'GPU with 8GB+ VRAM. Smooth experience with 7B coder models.'
  }
  if (vramGb >= 6) return {
    tier: 'A', label: 'Great',
    model: 'qwen2.5-coder:7b', sizeGb: 4.7,
    expectedSpeed: '25-40 tok/s',
    note: 'GPU with 6GB VRAM (your machine). 7B coder models run well.'
  }
  if (vramGb >= 4) return {
    tier: 'B', label: 'Good',
    model: 'qwen2.5-coder:3b', sizeGb: 2.0,
    expectedSpeed: '15-25 tok/s',
    note: 'GPU with 4GB VRAM. 3B coder models recommended.'
  }
  if (ramGb >= 16) return {
    tier: 'C', label: 'CPU OK',
    model: 'qwen2.5-coder:3b', sizeGb: 2.0,
    expectedSpeed: '5-12 tok/s',
    note: 'CPU only with 16GB+ RAM. 3B models usable; cloud may feel snappier.'
  }
  if (ramGb >= 8) return {
    tier: 'D', label: 'Limited',
    model: 'qwen2.5:1.5b', sizeGb: 0.9,
    expectedSpeed: '3-8 tok/s',
    note: 'Low-end hardware. Tiny models only. Free cloud (Groq/Gemini) likely better.'
  }
  return {
    tier: 'cloud-only', label: 'Use Cloud',
    model: null, sizeGb: 0,
    expectedSpeed: '—',
    note: 'Not enough resources for local AI. Use a free cloud provider.'
  }
}
