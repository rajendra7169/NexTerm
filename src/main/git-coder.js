// Git operations for Coder mode's Source Control panel.
// Uses the git CLI via child_process. Each call returns { ok, ... } so the
// renderer can show clean error states.

import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

function run(cwd, args, opts = {}) {
  return execFileP('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 20_000,
    ...opts
  }).then(
    ({ stdout, stderr }) => ({ ok: true, stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' }),
    (err) => ({ ok: false, error: String(err?.stderr || err?.message || err), code: err?.code })
  )
}

export function registerGitIpc() {
  // Is this directory a git repo? Returns { ok, isRepo, branch, ahead, behind, files }
  // where files is the parsed `git status --porcelain` result.
  ipcMain.handle('gitc:status', async (_, dir) => {
    if (!dir || !existsSync(dir)) return { ok: false, error: 'No directory' }
    // Cheap check first
    const inside = await run(dir, ['rev-parse', '--is-inside-work-tree'])
    if (!inside.ok || inside.stdout.trim() !== 'true') {
      return { ok: true, isRepo: false }
    }
    const [branchRes, statusRes, aheadBehindRes, hashRes] = await Promise.all([
      run(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
      run(dir, ['status', '--porcelain', '-z']),
      run(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => null),
      run(dir, ['rev-parse', '--short', 'HEAD']).catch(() => null)
    ])
    const branch = branchRes.ok ? branchRes.stdout.trim() : ''
    const headHash = hashRes && hashRes.ok ? hashRes.stdout.trim() : ''
    let ahead = 0, behind = 0
    if (aheadBehindRes?.ok && aheadBehindRes.stdout) {
      const m = aheadBehindRes.stdout.trim().split(/\s+/)
      ahead = Number(m[0]) || 0
      behind = Number(m[1]) || 0
    }
    // Parse porcelain -z output. Each entry: XY<space>path\0 (plus optional orig\0 for renames)
    const files = []
    if (statusRes.ok && statusRes.stdout) {
      const raw = statusRes.stdout
      let i = 0
      while (i < raw.length) {
        if (raw[i] === '\0') { i++; continue }
        const xy = raw.slice(i, i + 2)
        i += 3 // 'XY '
        // Read until null
        let end = raw.indexOf('\0', i)
        if (end < 0) end = raw.length
        const path = raw.slice(i, end)
        i = end + 1
        // Renames have second path before next null
        if (xy[0] === 'R' || xy[1] === 'R') {
          const e2 = raw.indexOf('\0', i)
          if (e2 < 0) break
          i = e2 + 1
        }
        files.push({
          path,
          index:    xy[0] !== ' ' ? xy[0] : null,    // staged status
          working:  xy[1] !== ' ' ? xy[1] : null,    // unstaged status
          staged:   xy[0] !== ' ' && xy[0] !== '?'
        })
      }
    }
    return { ok: true, isRepo: true, branch, ahead, behind, files, headHash }
  })

  // git init
  ipcMain.handle('gitc:init', async (_, dir) => {
    const r = await run(dir, ['init'])
    if (!r.ok) return { ok: false, error: r.error }
    // Ensure a default branch name (main).
    await run(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']).catch(() => null)
    return { ok: true }
  })

  // Stage / unstage files. paths can be a single string or array.
  ipcMain.handle('gitc:stage', async (_, { dir, paths }) => {
    const list = Array.isArray(paths) ? paths : [paths]
    if (list.length === 0) return { ok: true }
    const r = await run(dir, ['add', '--', ...list])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  ipcMain.handle('gitc:unstage', async (_, { dir, paths }) => {
    const list = Array.isArray(paths) ? paths : [paths]
    if (list.length === 0) return { ok: true }
    const r = await run(dir, ['reset', 'HEAD', '--', ...list])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  ipcMain.handle('gitc:stageAll', async (_, dir) => {
    const r = await run(dir, ['add', '-A'])
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  // Discard changes to a working-tree file (NOT staged changes).
  ipcMain.handle('gitc:discard', async (_, { dir, path }) => {
    const r = await run(dir, ['checkout', '--', path])
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  // Commit. Stages everything first if `stageAll` is true.
  ipcMain.handle('gitc:commit', async (_, { dir, message, stageAll }) => {
    if (!message || !message.trim()) return { ok: false, error: 'Commit message required' }
    if (stageAll) {
      const sa = await run(dir, ['add', '-A'])
      if (!sa.ok) return { ok: false, error: sa.error }
    }
    const r = await run(dir, ['commit', '-m', message])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, output: r.stdout }
  })

  // Recent commits. Returns [{ hash, shortHash, subject, author, dateISO, relDate }]
  ipcMain.handle('gitc:log', async (_, { dir, limit }) => {
    const n = Math.max(1, Math.min(500, Number(limit) || 30))
    // Use a delimiter that won't appear in commit text
    const FS = '\x1f'   // ASCII unit separator
    const RS = '\x1e'   // ASCII record separator
    const fmt = ['%H', '%h', '%s', '%an', '%aI', '%ar'].join(FS) + RS
    const r = await run(dir, ['log', `-n`, String(n), `--pretty=format:${fmt}`])
    if (!r.ok) return { ok: false, error: r.error }
    const out = r.stdout
      .split(RS)
      .map(s => s.trim())
      .filter(Boolean)
      .map(line => {
        const [hash, shortHash, subject, author, dateISO, relDate] = line.split(FS)
        return { hash, shortHash, subject, author, dateISO, relDate }
      })
    return { ok: true, commits: out }
  })

  // All staged changes as a single combined diff (capped). Used to feed
  // an AI commit-message generator.
  ipcMain.handle('gitc:diffStaged', async (_, dir) => {
    const r = await run(dir, ['diff', '--cached', '--stat'])
    if (!r.ok) return { ok: false, error: r.error }
    const full = await run(dir, ['diff', '--cached', '--no-color', '-U2'])
    if (!full.ok) return { ok: false, error: full.error }
    let body = full.stdout
    if (body.length > 30000) body = body.slice(0, 30000) + '\n…[truncated]'
    return { ok: true, stat: r.stdout, diff: body }
  })

  // Diff for a single file (unstaged vs working).
  ipcMain.handle('gitc:diffFile', async (_, { dir, path, staged }) => {
    const args = ['diff']
    if (staged) args.push('--cached')
    args.push('--', path)
    const r = await run(dir, args)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, diff: r.stdout }
  })

  // List branches (local + remote tracking). Returns:
  //   { local: [{name, current}], remote: [{name, tracking}] }
  ipcMain.handle('gitc:listBranches', async (_, dir) => {
    const r = await run(dir, ['branch', '-a', '--no-color', '--format=%(refname:short)\x1f%(HEAD)\x1f%(upstream:short)'])
    if (!r.ok) return { ok: false, error: r.error }
    const local = []
    const remote = []
    for (const line of r.stdout.split('\n')) {
      const parts = line.split('\x1f')
      if (parts.length < 2 || !parts[0]) continue
      const name = parts[0]
      const isHead = parts[1] === '*'
      const upstream = parts[2] || ''
      if (name.startsWith('origin/') || name.includes('/HEAD')) {
        if (!name.endsWith('/HEAD')) remote.push({ name, tracking: '' })
      } else {
        local.push({ name, current: isHead, upstream })
      }
    }
    return { ok: true, local, remote }
  })

  // Switch to a branch (must already exist locally or be a remote tracking branch).
  ipcMain.handle('gitc:checkout', async (_, { dir, branch, createFromRemote }) => {
    let args
    if (createFromRemote) {
      // e.g. branch = "origin/feature/x" → checkout -b feature/x --track origin/feature/x
      const local = branch.replace(/^origin\//, '')
      args = ['checkout', '-b', local, '--track', branch]
    } else {
      args = ['checkout', branch]
    }
    const r = await run(dir, args)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  // Rename a branch (or the current branch if `oldName` is omitted).
  ipcMain.handle('gitc:renameBranch', async (_, { dir, oldName, newName }) => {
    if (!newName || !newName.trim()) return { ok: false, error: 'New name required' }
    const safe = newName.trim().replace(/\s+/g, '-')
    const args = ['branch', '-m']
    if (oldName) args.push(oldName, safe)
    else args.push(safe)
    const r = await run(dir, args)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, name: safe }
  })

  // Create a new branch from the current HEAD and switch to it.
  ipcMain.handle('gitc:createBranch', async (_, { dir, name }) => {
    if (!name || !name.trim()) return { ok: false, error: 'Branch name required' }
    const safe = name.trim().replace(/\s+/g, '-')
    const r = await run(dir, ['checkout', '-b', safe])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, name: safe }
  })

  // Stash operations
  ipcMain.handle('gitc:stashList', async (_, dir) => {
    const r = await run(dir, ['stash', 'list', '--pretty=%gd\x1f%s\x1f%cr'])
    if (!r.ok) return { ok: false, error: r.error }
    const entries = r.stdout.split('\n').filter(Boolean).map(line => {
      const [ref, subject, relDate] = line.split('\x1f')
      return { ref, subject, relDate }
    })
    return { ok: true, entries }
  })

  ipcMain.handle('gitc:stashPush', async (_, { dir, message, includeUntracked }) => {
    const args = ['stash', 'push']
    if (includeUntracked) args.push('-u')
    if (message && message.trim()) args.push('-m', message.trim())
    const r = await run(dir, args)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  ipcMain.handle('gitc:stashApply', async (_, { dir, ref, pop }) => {
    const r = await run(dir, ['stash', pop ? 'pop' : 'apply', ref || ''])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  ipcMain.handle('gitc:stashDrop', async (_, { dir, ref }) => {
    const r = await run(dir, ['stash', 'drop', ref])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  // Discard ALL working-tree changes (and untracked files). Destructive.
  ipcMain.handle('gitc:discardAll', async (_, { dir, includeUntracked }) => {
    const r1 = await run(dir, ['reset', '--hard', 'HEAD'])
    if (!r1.ok) return { ok: false, error: r1.error }
    if (includeUntracked) {
      const r2 = await run(dir, ['clean', '-fd'])
      if (!r2.ok) return { ok: false, error: r2.error }
    }
    return { ok: true }
  })

  // Conflict resolution: accept one side for a file
  ipcMain.handle('gitc:resolveConflict', async (_, { dir, path, side }) => {
    // side: 'ours' | 'theirs'
    const flag = side === 'ours' ? '--ours' : '--theirs'
    const co = await run(dir, ['checkout', flag, '--', path])
    if (!co.ok) return { ok: false, error: co.error }
    const add = await run(dir, ['add', '--', path])
    if (!add.ok) return { ok: false, error: add.error }
    return { ok: true }
  })

  // Blame for a file. Returns one entry per line: { line, hash, author, dateISO, text }
  ipcMain.handle('gitc:blame', async (_, { dir, path }) => {
    let rel = path
    if (path.startsWith(dir)) rel = path.slice(dir.length).replace(/^[\\/]/, '')
    rel = rel.replace(/\\/g, '/')
    const r = await run(dir, ['blame', '--line-porcelain', '--', rel])
    if (!r.ok) return { ok: false, error: r.error }
    const entries = []
    let cur = null
    for (const line of r.stdout.split('\n')) {
      if (!line) continue
      if (line.startsWith('\t')) {
        if (cur) { cur.text = line.slice(1); entries.push(cur); cur = null }
        continue
      }
      const m = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
      if (m) { cur = { hash: m[1], shortHash: m[1].slice(0, 7), line: Number(m[2]) }; continue }
      if (cur) {
        if (line.startsWith('author '))     cur.author = line.slice(7)
        else if (line.startsWith('author-time ')) cur.dateUnix = Number(line.slice(12))
        else if (line.startsWith('summary '))     cur.summary = line.slice(8)
      }
    }
    return { ok: true, entries }
  })

  // Revert a single commit (creates a new "Revert ..." commit)
  ipcMain.handle('gitc:revert', async (_, { dir, hash }) => {
    const r = await run(dir, ['revert', '--no-edit', hash])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  // Cherry-pick a commit onto the current branch
  ipcMain.handle('gitc:cherryPick', async (_, { dir, hash }) => {
    const r = await run(dir, ['cherry-pick', hash])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  })

  // Append a pattern to .gitignore (creating the file if needed).
  ipcMain.handle('gitc:gitignoreAdd', async (_, { dir, pattern }) => {
    if (!pattern || !pattern.trim()) return { ok: false, error: 'Pattern required' }
    const fs = await import('node:fs')
    const p = join(dir, '.gitignore')
    let existing = ''
    try { existing = fs.readFileSync(p, 'utf8') } catch {}
    const lines = existing.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.includes(pattern.trim())) return { ok: true, alreadyIgnored: true }
    const sep = existing && !existing.endsWith('\n') ? '\n' : ''
    try {
      fs.writeFileSync(p, existing + sep + pattern.trim() + '\n', 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // git push (with optional --set-upstream + remote/branch fallback)
  ipcMain.handle('gitc:push', async (_, { dir, setUpstream }) => {
    // First try a plain push
    let r = await run(dir, ['push'], { timeout: 60_000 })
    if (!r.ok && setUpstream) {
      // Detect current branch
      const b = await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
      const branch = b.ok ? b.stdout.trim() : 'main'
      r = await run(dir, ['push', '-u', 'origin', branch], { timeout: 60_000 })
    }
    if (!r.ok) return { ok: false, error: r.error || 'push failed' }
    return { ok: true, output: (r.stdout || '') + (r.stderr || '') }
  })

  ipcMain.handle('gitc:pull', async (_, dir) => {
    const r = await run(dir, ['pull', '--ff-only'], { timeout: 60_000 })
    if (!r.ok) return { ok: false, error: r.error || 'pull failed' }
    return { ok: true, output: (r.stdout || '') + (r.stderr || '') }
  })

  ipcMain.handle('gitc:fetch', async (_, dir) => {
    const r = await run(dir, ['fetch', '--all', '--prune'], { timeout: 60_000 })
    if (!r.ok) return { ok: false, error: r.error || 'fetch failed' }
    return { ok: true, output: (r.stdout || '') + (r.stderr || '') }
  })

  // Diff for a single commit (full patch).
  ipcMain.handle('gitc:commitDiff', async (_, { dir, hash }) => {
    const r = await run(dir, ['show', '--no-color', '--format=%H%n%s%n%an%n%aI%n', hash])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, diff: r.stdout }
  })

  // Per-line markers for the editor gutter. Returns
  // { added: [lineNumbers], modified: [lineNumbers], removedAt: [lineNumbers] }
  // computed by parsing a `git diff -U0 --no-color` hunk header sweep.
  ipcMain.handle('gitc:fileMarkers', async (_, { dir, path }) => {
    // Use the relative path from the repo root.
    let rel = path
    if (path.startsWith(dir)) rel = path.slice(dir.length).replace(/^[\\/]/, '')
    rel = rel.replace(/\\/g, '/')
    const r = await run(dir, ['diff', '--no-color', '-U0', '--', rel])
    if (!r.ok) {
      // File may not be in repo yet — treat as all-added would be wrong; just return empty
      return { ok: true, added: [], modified: [], removedAt: [] }
    }
    const added = []
    const modified = []
    const removedAt = []
    const hunkRe = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/
    for (const line of r.stdout.split('\n')) {
      const m = line.match(hunkRe)
      if (!m) continue
      const oldCount = m[2] === undefined ? 1 : Number(m[2])
      const newStart = Number(m[3])
      const newCount = m[4] === undefined ? 1 : Number(m[4])
      if (oldCount === 0) {
        // Pure insertion
        for (let i = 0; i < newCount; i++) added.push(newStart + i)
      } else if (newCount === 0) {
        // Pure deletion — mark a "removed" marker at the line that follows
        removedAt.push(newStart)
      } else {
        // Modification span
        for (let i = 0; i < newCount; i++) modified.push(newStart + i)
      }
    }
    return { ok: true, added, modified, removedAt }
  })
}
