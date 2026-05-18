// AI module entry — provider router + reusable system prompts.

import * as ollama       from './providers/ollama.js'
import * as groq         from './providers/groq.js'
import * as gemini       from './providers/gemini.js'
import * as openrouter   from './providers/openrouter.js'
import * as cerebras     from './providers/cerebras.js'
import * as anthropic    from './providers/anthropic.js'
import * as anthropicCli from './providers/anthropic-cli.js'
import * as bundled      from './bundled-llama.js'
import { detectHardware, recommendTier, detectGpu, classifyGpuRuntime } from './hardware.js'
import { detectOllama, isOllamaRunning, listLocalModels, startOllama, stopOllama } from './ollama-manager.js'
import { installOllama } from './installer.js'
import { pullModel, deleteModel } from './model-puller.js'

// The 'anthropic' provider has two backends:
//   - API key (anthropic.js)        — pay per token
//   - Pro-subscription via CLI (anthropic-cli.js)
// The router picks one based on the call's `authMode` field. If unset,
// API key is used when a key is present, CLI otherwise.
const PROVIDERS = {
  ollama, groq, gemini, openrouter, cerebras, bundled,
  anthropic, 'anthropic-cli': anthropicCli
}
export { bundled, anthropicCli }

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
fix as a single concrete command. Format as: a short paragraph, then a fenced "fix" block.`,

  // Inline ghost-text autocomplete. Must complete the partial command — do NOT
  // re-output what the user already typed. One short single-line completion only.
  autocomplete: `You are an inline command-completer for Windows PowerShell.
The user has typed a partial command. Complete it with the SINGLE most likely continuation.
Output ONLY the characters needed to finish the command — do NOT repeat what the user typed,
do NOT include explanation, markdown, quotes, or newlines. If you cannot guess confidently,
reply with the single character: ?`,

  // Generate a concise commit message from a staged diff.
  commitMessage: `You are a git commit-message author. Given a staged diff, write
a single conventional commit message: short imperative subject line under 72
characters, optionally followed by a blank line and a brief body (max 3 short
bullet points). Output ONLY the commit message — no quotes, no markdown, no
explanation, no preamble.`
}

// Resolve which Anthropic backend to use. When the caller specifies a
// provider of 'anthropic', we inspect authMode + apiKey availability:
//   authMode='cli'  → spawn Claude Code CLI (subscription auth)
//   authMode='api'  → use api.anthropic.com with apiKey
//   undefined       → API key path if a key is present, CLI otherwise
function resolveAnthropic(provider, authMode, apiKey) {
  if (provider !== 'anthropic') return provider
  if (authMode === 'cli') return 'anthropic-cli'
  if (authMode === 'api') return 'anthropic'
  return apiKey ? 'anthropic' : 'anthropic-cli'
}

export async function complete({ provider, prompt, system, images, model, apiKey, authMode, cwd, chatMode }) {
  const resolved = resolveAnthropic(provider, authMode, apiKey)
  const p = PROVIDERS[resolved]
  if (!p) throw new Error(`Unknown AI provider: ${provider}`)
  return p.complete({ prompt, system, images, model, apiKey, cwd, chatMode })
}

export async function* streamComplete({ provider, prompt, system, images, model, apiKey, authMode, cwd, chatMode, signal }) {
  const resolved = resolveAnthropic(provider, authMode, apiKey)
  const p = PROVIDERS[resolved]
  if (!p) throw new Error(`Unknown AI provider: ${provider}`)
  if (!p.streamComplete) {
    const text = await p.complete({ prompt, system, images, model, apiKey, cwd, chatMode })
    yield text
    return
  }
  yield* p.streamComplete({ prompt, system, images, model, apiKey, cwd, chatMode, signal })
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
  classifyGpuRuntime,
  detectOllama,
  isOllamaRunning,
  listLocalModels,
  startOllama,
  stopOllama,
  installOllama,
  pullModel,
  deleteModel
}
