// AI module entry — provider router + reusable system prompts.

import * as ollama     from './providers/ollama.js'
import * as groq       from './providers/groq.js'
import * as gemini     from './providers/gemini.js'
import * as openrouter from './providers/openrouter.js'
import * as cerebras   from './providers/cerebras.js'
import { detectHardware, recommendTier, detectGpu } from './hardware.js'
import { detectOllama, isOllamaRunning, listLocalModels, startOllama } from './ollama-manager.js'
import { installOllama } from './installer.js'
import { pullModel, deleteModel } from './model-puller.js'

const PROVIDERS = { ollama, groq, gemini, openrouter, cerebras }

// Reusable system prompts. Renderer can override per call but these are the defaults.
export const SYSTEM_PROMPTS = {
  // Natural language → command
  command: `You are a terminal command generator running on Windows PowerShell unless told otherwise.
The user describes what they want to do. Reply with ONLY the command — no explanation,
no markdown, no code fences, no quotes. If multiple steps are required, separate them
with newlines. Never include "PS>" or other prompt prefixes.`,

  // Explain an error from terminal output
  explain: `You are a helpful terminal assistant. The user pasted output from a failed command.
Explain in plain language what went wrong (under 200 words) and suggest the most likely
fix as a single concrete command. Format as: a short paragraph, then a fenced "fix" block.`
}

export async function complete({ provider, prompt, system, model, apiKey }) {
  const p = PROVIDERS[provider]
  if (!p) throw new Error(`Unknown AI provider: ${provider}`)
  return p.complete({ prompt, system, model, apiKey })
}

export async function testProvider({ provider, apiKey }) {
  const p = PROVIDERS[provider]
  if (!p) return { ok: false, error: 'Unknown provider' }
  return p.testConnection({ apiKey })
}

export {
  detectHardware,
  recommendTier,
  detectGpu,
  detectOllama,
  isOllamaRunning,
  listLocalModels,
  startOllama,
  installOllama,
  pullModel,
  deleteModel
}
