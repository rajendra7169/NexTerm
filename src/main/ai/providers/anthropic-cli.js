// Anthropic provider via the Claude Code CLI subprocess.
//
// This is the "$0 extra cost" path: the user runs Claude Code (`npm i -g
// @anthropic-ai/claude-code`) and logs in once with their Claude Pro
// subscription. NexTerm then spawns `claude -p "<prompt>" --output-format
// stream-json --include-partial-messages` as a child process per request
// and renders the JSON stream as a normal text response (for now).
//
// Authentication is owned entirely by the CLI — we don't touch tokens
// or call api.anthropic.com directly. If the user isn't logged in, the
// CLI returns an auth error on first call which we surface verbatim.
//
// A future iteration will pass through tool-use events (file edits with
// diff previews, permission prompts, thinking blocks) — for v1 we just
// capture the final text response so it slots into NexTerm's existing
// chat UI as a regular model reply.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const CLI_TIMEOUT_MS = 5 * 60_000  // 5 min — agent tasks can take a while

// Per-project session IDs, so successive messages in the same NexTerm
// chat continue the same Claude Code conversation instead of re-sending
// the entire history. Cleared when NexTerm restarts.
const projectSessions = new Map()  // cwdAbsolute → claudeSessionId

// Locate the `claude` binary. On Windows, npm globals install to
// %APPDATA%\npm with a .cmd shim; on POSIX it's usually /usr/local/bin
// or wherever the user's npm prefix is. We try the well-known spots and
// fall back to PATH lookup.
function resolveClaudeBinary() {
  const isWin = process.platform === 'win32'
  if (isWin) {
    const candidates = [
      process.env.APPDATA && join(process.env.APPDATA, 'npm', 'claude.cmd'),
      process.env.APPDATA && join(process.env.APPDATA, 'npm', 'claude.exe'),
      'C:\\Program Files\\nodejs\\claude.cmd'
    ].filter(Boolean)
    for (const p of candidates) if (existsSync(p)) return p
  } else {
    const candidates = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      process.env.HOME && join(process.env.HOME, '.npm-global', 'bin', 'claude')
    ].filter(Boolean)
    for (const p of candidates) if (existsSync(p)) return p
  }
  // Fall back to PATH — spawn will fail if it's not there, which we handle.
  return 'claude'
}

// Detect whether the CLI is installed and how to invoke it. Returns null if
// not installed, otherwise { bin, version }.
export async function detectClaudeCli() {
  const bin = resolveClaudeBinary()
  return new Promise(resolve => {
    let out = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 5000)
    let child
    try {
      child = spawn(bin, ['--version'], { windowsHide: true, shell: process.platform === 'win32' })
    } catch {
      clearTimeout(timer)
      return resolve(null)
    }
    child.stdout?.on('data', d => { out += d.toString() })
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', code => {
      clearTimeout(timer)
      if (timedOut || code !== 0) return resolve(null)
      const m = out.match(/(\d+\.\d+\.\d+)/)
      resolve({ bin, version: m?.[1] || 'unknown' })
    })
  })
}

// Build the spawn args for `claude -p`. chatMode controls what tools
// Claude is allowed to use:
//   'agent' → full tools, edits auto-approved (acceptEdits)
//   'ask'   → read-only tools (Read/Glob/Grep). Edits/Bash refused so
//             Claude answers questions without modifying the project.
function buildArgs({ cwdAbs, model, chatMode }) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose']
  if (chatMode === 'ask') {
    // Read-only: Claude can inspect the project to answer questions but
    // can't edit, write, run shell commands, or fetch the web.
    args.push('--allowed-tools', 'Read,Glob,Grep,LS')
  } else {
    // Agent mode: auto-approve file edits. Bash etc. still ask if the
    // CLI's policy requires it, but most file work just goes through.
    args.push('--permission-mode', 'acceptEdits')
  }
  const sid = projectSessions.get(cwdAbs)
  if (sid) args.push('--resume', sid)
  if (model) args.push('--model', model)
  return args
}

// Streaming generator. Yields event objects of three shapes:
//   { type: 'text',        text }
//   { type: 'tool_call',   tool, input, id }
//   { type: 'tool_result', toolUseId, text, isError }
//
// Under the hood we run `claude -p --output-format stream-json --verbose`
// which emits one JSON object per line on stdout. We parse them as they
// arrive and yield in real time.
async function* runClaudeStream({ prompt, cwd, model, chatMode, signal }) {
  const bin = resolveClaudeBinary()
  const cwdAbs = cwd || process.cwd()
  const args = buildArgs({ cwdAbs, model, chatMode })

  const child = spawn(bin, args, {
    cwd: cwdAbs,
    windowsHide: true,
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  try { child.stdin.write(prompt); child.stdin.end() } catch {}

  const timer = setTimeout(() => { try { child.kill() } catch {} }, CLI_TIMEOUT_MS)
  if (signal) {
    const onAbort = () => { try { child.kill() } catch {} }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  // Pump stdout into a queue and yield as events become available.
  const queue = []
  let done = false
  let stderr = ''
  let errorMsg = null
  let resolveWaiter = null

  const wake = () => { if (resolveWaiter) { const r = resolveWaiter; resolveWaiter = null; r() } }
  const push = (evt) => { queue.push(evt); wake() }

  let stdoutBuf = ''
  child.stdout.on('data', d => {
    stdoutBuf += d.toString()
    let nl
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim()
      stdoutBuf = stdoutBuf.slice(nl + 1)
      if (!line) continue
      let evt
      try { evt = JSON.parse(line) } catch { continue }
      handleEvent(evt, push, cwdAbs)
    }
  })
  child.stderr.on('data', d => { stderr += d.toString() })
  child.on('error', err => {
    errorMsg = err.code === 'ENOENT'
      ? 'Claude Code CLI is not installed. Run: npm install -g @anthropic-ai/claude-code'
      : String(err?.message || err)
    done = true; wake()
  })
  child.on('close', code => {
    clearTimeout(timer)
    if (code !== 0 && !errorMsg) {
      errorMsg = stderr.trim() || `Claude CLI exited with code ${code}`
    }
    done = true; wake()
  })

  while (true) {
    if (queue.length > 0) { yield queue.shift(); continue }
    if (done) break
    await new Promise(r => { resolveWaiter = r })
  }
  if (errorMsg) throw new Error(errorMsg)
}

// Convert one stream-json event into our internal event shape and push to
// the consumer queue. The Claude Code stream-json schema:
//   { type: 'system', subtype: 'init', session_id }
//   { type: 'assistant', message: { content: [ { type:'text', text } | { type:'tool_use', name, input, id } ] } }
//   { type: 'user',      message: { content: [ { type:'tool_result', tool_use_id, content, is_error } ] } }
//   { type: 'result',    subtype, result }
//
// We dedupe duplicate text chunks (--include-partial-messages can repeat
// the cumulative text) by tracking what's already been emitted per
// content-block id.
const emittedText = new WeakMap()

function handleEvent(evt, push, cwdAbs) {
  if (!evt) return
  if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
    projectSessions.set(cwdAbs, evt.session_id)
    return
  }
  if (evt.type === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        push({ type: 'text', text: block.text })
      } else if (block.type === 'tool_use') {
        push({ type: 'tool_call', tool: block.name, input: block.input || {}, id: block.id })
      }
    }
    return
  }
  if (evt.type === 'user' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'tool_result') {
        const text = Array.isArray(block.content)
          ? block.content.map(c => c.text || c.type || '').join('\n')
          : String(block.content || '')
        push({
          type: 'tool_result',
          toolUseId: block.tool_use_id,
          text,
          isError: !!block.is_error
        })
      }
    }
    return
  }
  if (evt.type === 'result') {
    // We don't need to forward this — the close event ends the stream.
  }
}

export async function complete({ prompt, system, model, cwd, signal, chatMode }) {
  const full = system ? `[SYSTEM]\n${system}\n[/SYSTEM]\n\n${prompt}` : prompt
  let text = ''
  for await (const evt of runClaudeStream({ prompt: full, cwd, model, chatMode, signal })) {
    if (evt.type === 'text') text += evt.text
  }
  return text
}

export async function* streamComplete({ prompt, system, model, cwd, signal, chatMode }) {
  const full = system ? `[SYSTEM]\n${system}\n[/SYSTEM]\n\n${prompt}` : prompt
  yield* runClaudeStream({ prompt: full, cwd, model, chatMode, signal })
}

export async function testConnection() {
  const info = await detectClaudeCli()
  if (!info) return { ok: false, error: 'Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code' }
  return { ok: true, version: info.version }
}

// Open an interactive `claude login` window so the user can authenticate
// against their Claude Pro account. Returns when the subprocess exits.
export function startLoginFlow() {
  return new Promise((resolve) => {
    const bin = resolveClaudeBinary()
    try {
      const child = spawn(bin, ['login'], {
        windowsHide: false,
        shell: process.platform === 'win32',
        detached: true,
        stdio: 'inherit'
      })
      child.on('close', code => resolve({ ok: code === 0 }))
      child.on('error', err => resolve({ ok: false, error: String(err?.message || err) }))
    } catch (e) {
      resolve({ ok: false, error: String(e?.message || e) })
    }
  })
}
