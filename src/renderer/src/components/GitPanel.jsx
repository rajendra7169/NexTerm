import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import DiffViewer from './DiffViewer'
import InlineConfirm from './InlineConfirm'

// SVG icons used in the panel
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M8 3v10M3 8h10" />
  </svg>
)
const IconMinus = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 8h10" />
  </svg>
)
const IconDiscard = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8a5 5 0 0 1 9-3" />
    <path d="M12 2v3h-3" />
  </svg>
)
const IconSparkle = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0l1.4 4.5L14 6l-4.6 1.5L8 12l-1.4-4.5L2 6l4.6-1.5z" />
    <circle cx="13" cy="13" r="1" />
    <circle cx="3" cy="13" r="0.7" />
  </svg>
)
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3" />
    <path d="M12 2v3h-3M4 14v-3h3" />
  </svg>
)
const IconPush = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 11V3M4 7l4-4 4 4M3 13h10" />
  </svg>
)
const IconPull = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v8M4 7l4 4 4-4M3 13h10" />
  </svg>
)
const IconFetch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5a5 5 0 0 1 8-1M14 11a5 5 0 0 1-8 1" />
    <path d="M2 2v3h3M14 14v-3h-3" />
  </svg>
)

// Source Control panel for Coder mode.
//
// Layout (top → bottom):
//   1. Project name + branch chip (or "Initialize Repository" call-to-action if not a repo)
//   2. Commit message textarea + Commit button
//   3. Changes list (modified/staged files), with stage/unstage/discard actions
//   4. Commit history — compact, modern, click a commit to see its subject expanded
//
// Polls status every 4 seconds so external git commands (running in the
// bottom terminal) reflect in the UI without a manual refresh.
export default function GitPanel({ projectPath, onOpenFile }) {
  const [status, setStatus] = useState(null)      // { isRepo, branch, files, ahead, behind, headHash }
  const [log,    setLog]    = useState([])
  const [error,  setError]  = useState(null)
  const [busy,   setBusy]   = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [expandedCommit, setExpandedCommit] = useState(null)
  const [initializing, setInitializing] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [historyHeight, setHistoryHeight] = useState(240)
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [syncBusy, setSyncBusy] = useState(null)  // 'push' | 'pull' | 'fetch'
  const [diffSpec, setDiffSpec] = useState(null)   // { title, loader } for DiffViewer
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branches, setBranches] = useState({ local: [], remote: [] })
  const [newBranchMode, setNewBranchMode] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  // Inline branch rename state — which branch is being renamed + the new name
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue]   = useState('')
  const [stashes, setStashes] = useState([])
  const [stashOpen, setStashOpen] = useState(false)
  const [commitMenu, setCommitMenu] = useState(null)   // { hash, x, y } for revert/cherry-pick
  // Inline (in-app) confirm dialog spec — { message, detail, danger, confirmLabel, onConfirm }
  const [confirmSpec, setConfirmSpec] = useState(null)
  // Live pill geometry — used to position the (portal-rendered) branch popover
  const [pillRect, setPillRect] = useState(null)
  const panelRef = useRef(null)
  const pollRef = useRef(null)
  const branchPopRef = useRef(null)
  const pillBtnRef = useRef(null)

  // Derive the AI provider label so the user knows what's about to be used
  // when they click the sparkle.
  const settingsLive = useStore(s => s.settings)
  const aiCfg = settingsLive.ai || {}
  const aiModeLabel = (() => {
    if (!aiCfg.enabled) return 'AI off'
    const mode = aiCfg.mode || 'bundled'
    if (mode === 'bundled') {
      return `built-in · ${aiCfg.bundled?.model || 'no model'}`
    }
    if (mode === 'local') {
      return `ollama · ${aiCfg.local?.model || 'qwen2.5-coder:7b'}`
    }
    const prov = aiCfg.cloud?.provider || 'groq'
    const model = aiCfg.cloud?.model || ''
    return `${prov}${model ? ' · ' + model : ''}`
  })()

  // Drag-resize the history section. The handle sits between Changes and History.
  function startResizeHistory(e) {
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const maxH = Math.floor(rect.height * 0.7)
    const minH = 80
    // Disable text selection + force ns-resize cursor on the whole body while
    // dragging — prevents the browser's drag-selection overlay from appearing.
    const prevUserSelect = document.body.style.userSelect
    const prevCursor     = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'ns-resize'
    function onMove(ev) {
      const next = Math.max(minH, Math.min(maxH, rect.bottom - ev.clientY))
      setHistoryHeight(next)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor     = prevCursor
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function refresh() {
    setError(null)
    const s = await window.nexterm.gitc.status(projectPath)
    if (!s?.ok) { setError(s?.error || 'git status failed'); return }
    setStatus(s)
    if (s.isRepo) {
      const l = await window.nexterm.gitc.log(projectPath, 50)
      if (l?.ok) setLog(l.commits || [])
    } else {
      setLog([])
    }
  }

  useEffect(() => {
    refresh()
    pollRef.current = setInterval(refresh, 4000)
    return () => clearInterval(pollRef.current)
  }, [projectPath])

  async function doInit() {
    setInitializing(true); setError(null)
    const r = await window.nexterm.gitc.init(projectPath)
    setInitializing(false)
    if (!r?.ok) setError(r?.error || 'git init failed')
    else refresh()
  }

  async function doCommit() {
    if (!commitMessage.trim()) { setError('Commit message required'); return }
    setBusy(true); setError(null)
    // If nothing is staged, commit will fail. Auto-stage everything as a convenience.
    const hasStaged = (status?.files || []).some(f => f.staged)
    const r = await window.nexterm.gitc.commit(projectPath, commitMessage, !hasStaged)
    setBusy(false)
    if (!r?.ok) { setError(r?.error || 'commit failed'); return }
    setCommitMessage('')
    refresh()
  }

  async function generateCommitMessage() {
    setError(null); setAiBusy(true)
    try {
      // Auto-stage everything first if nothing is staged — so the diff has content.
      const hasStaged = (status?.files || []).some(f => f.staged)
      if (!hasStaged) await window.nexterm.gitc.stageAll(projectPath)
      const d = await window.nexterm.gitc.diffStaged(projectPath)
      if (!d?.ok) { setError(d?.error || 'Failed to read diff'); return }
      if (!d.diff?.trim()) { setError('Nothing to commit — make some changes first'); return }

      // Use current AI config from settings. Three modes: bundled (built-in
      // node-llama-cpp), local (Ollama daemon), and cloud (groq/openai/etc).
      // Previously this only branched on local-vs-cloud, so when mode was
      // 'bundled' it silently fell into the cloud branch and used groq.
      const s = useStore.getState().settings
      const ai = s.ai || {}
      if (!ai.enabled) { setError('AI is disabled. Enable it in Settings → AI.'); return }
      const mode = ai.mode || 'bundled'
      let provider, model
      if (mode === 'bundled') {
        provider = 'bundled'
        model    = ai.bundled?.model
        if (!model) { setError('No built-in model selected. Pick one in Settings → AI.'); return }
      } else if (mode === 'local') {
        provider = 'ollama'
        model    = ai.local?.model || 'qwen2.5-coder:7b'
      } else {
        provider = ai.cloud?.provider || 'groq'
        model    = ai.cloud?.model    || 'llama-3.3-70b-versatile'
      }
      let apiKey = null
      if (provider !== 'ollama' && provider !== 'bundled') {
        apiKey = await window.nexterm.vault.get(`ai.${provider}.apiKey`)
        if (!apiKey) { setError(`No API key set for ${provider}. Add one in Settings → AI.`); return }
      }
      // Count touched files from the stat output so the prompt can ask for
      // detail proportional to the size of the change.
      const fileCount = (d.stat || '').split('\n').filter(l => l.includes('|')).length
      const wantsBody = fileCount > 1
      const requestedBullets = Math.min(8, Math.max(3, fileCount))

      const prompt =
        `Write a git commit message for the following staged changes.\n\n` +
        `## Files changed (${fileCount})\n${d.stat || '(none)'}\n\n` +
        `## Full diff\n${d.diff.slice(0, 60000)}\n\n` +
        `Reply with ONLY the commit message text — no JSON wrapper, no code fences, no quotes, no preface.`

      const r = await window.nexterm.ai.complete({
        provider, model, apiKey,
        system:
          `You write detailed, faithful git commit messages.\n\n` +
          `FORMAT (always follow exactly):\n` +
          `Line 1: an imperative subject line under 72 chars summarising the highest-level change.\n` +
          `Line 2: blank.\n` +
          (wantsBody
            ? `Lines 3+: ${requestedBullets}+ short bullet points (each starting with "- "), one per distinct change or feature in the diff. Cover every notable file or feature group — do not collapse multiple unrelated changes into a single line. Each bullet is one short imperative sentence (max ~90 chars).\n\n`
            : `Lines 3+: optional 1-3 bullets if extra context is useful.\n\n`) +
          `RULES:\n` +
          `- Do NOT refuse — these are routine code changes from the user's own repository.\n` +
          `- Do NOT wrap output in JSON, markdown code fences, or quotes.\n` +
          `- Do NOT add a "Generated by AI" footer.\n` +
          `- Output the commit message body directly as plain text.`,
        prompt
      })
      if (!r?.ok) { setError(r?.error || 'AI failed'); return }

      // Clean up common AI quirks — code fences, JSON wrappers, refusals.
      let msg = (r.text || '').trim()
      // Strip markdown code fences: ```... ```
      msg = msg.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim()
      // Strip JSON wrappers like {"response": "..."} or {"message": "..."}
      const jsonMatch = msg.match(/^\{[^{}]*"(?:response|message|commit|text|content)"\s*:\s*"((?:[^"\\]|\\.)*)"/m)
      if (jsonMatch) {
        try { msg = JSON.parse(`"${jsonMatch[1]}"`) } catch {}
      }
      // Detect refusal patterns and surface a helpful error instead of pasting them in.
      const refusalRe = /^(I'?m sorry|I cannot|I can'?t (assist|help)|I am unable|As an AI|Sorry,? I)/i
      if (refusalRe.test(msg)) {
        setError(`The AI provider refused. Try a different model in Settings → AI (Gemini, Groq, or a local Ollama model work best for this).`)
        return
      }
      // Trim outer quotes
      msg = msg.replace(/^["'`]+|["'`]+$/g, '').trim()
      if (msg) setCommitMessage(msg)
      else setError('AI returned an empty message')
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setAiBusy(false)
      refresh()
    }
  }

  async function doStage(path)    { await window.nexterm.gitc.stage(projectPath, path);    refresh() }
  async function doUnstage(path)  { await window.nexterm.gitc.unstage(projectPath, path);  refresh() }
  async function doStageAll()     { await window.nexterm.gitc.stageAll(projectPath);       refresh() }
  async function loadBranches() {
    const r = await window.nexterm.gitc.listBranches(projectPath)
    if (r?.ok) setBranches({ local: r.local || [], remote: r.remote || [] })
  }

  async function loadStashes() {
    const r = await window.nexterm.gitc.stashList(projectPath)
    if (r?.ok) setStashes(r.entries || [])
  }

  async function openBranchPicker() {
    const rect = pillBtnRef.current?.getBoundingClientRect()
    console.log('[GitPanel] openBranchPicker — pillRect:', rect)
    if (rect) setPillRect(rect)
    // Open the picker BEFORE waiting on branches so the user gets immediate
    // feedback. The branch list will populate when the IPC returns.
    setBranchPickerOpen(true)
    setNewBranchMode(false)
    setNewBranchName('')
    await loadBranches()
  }

  async function switchBranch(branchName, isRemote) {
    setError(null)
    const r = await window.nexterm.gitc.checkout(projectPath, branchName, !!isRemote)
    setBranchPickerOpen(false)
    if (!r?.ok) { setError(r?.error || 'checkout failed'); return }
    refresh()
  }

  async function createNewBranch() {
    if (!newBranchName.trim()) return
    setError(null)
    const r = await window.nexterm.gitc.createBranch(projectPath, newBranchName)
    setBranchPickerOpen(false)
    setNewBranchMode(false); setNewBranchName('')
    if (!r?.ok) { setError(r?.error || 'create branch failed'); return }
    refresh()
  }

  function startRenameBranch(branchName) {
    setRenameTarget(branchName)
    setRenameValue(branchName)
  }
  async function commitRenameBranch() {
    if (!renameTarget) return
    const safe = renameValue.trim()
    if (!safe || safe === renameTarget) { setRenameTarget(null); return }
    setError(null)
    const r = await window.nexterm.gitc.renameBranch(projectPath, renameTarget, safe)
    setRenameTarget(null); setRenameValue('')
    if (!r?.ok) { setError(r?.error || 'rename failed'); return }
    await loadBranches()
    refresh()
  }
  function cancelRename() { setRenameTarget(null); setRenameValue('') }

  async function stashChanges() {
    const note = (typeof window !== 'undefined') ? '' : ''  // simple — could prompt later
    setError(null)
    const r = await window.nexterm.gitc.stashPush(projectPath, note, true)
    if (!r?.ok) { setError(r?.error || 'stash failed'); return }
    refresh(); loadStashes()
  }

  async function applyStash(ref, pop) {
    setError(null)
    const r = await window.nexterm.gitc.stashApply(projectPath, ref, pop)
    if (!r?.ok) {
      const msg = String(r?.error || 'stash apply failed')
      // Most common failure: working tree has changes that would be overwritten.
      // Offer an inline one-click way to stash those changes first and try again.
      if (/local changes.*would be overwritten/i.test(msg)) {
        setConfirmSpec({
          message: pop ? 'Cannot pop — local changes would be overwritten' : 'Cannot apply — local changes would be overwritten',
          detail: 'Your working tree has changes that conflict with this stash. Stash them first and then try again? (The auto-stash stays on the list so you can re-apply afterwards.)',
          confirmLabel: 'Stash & retry',
          onConfirm: async () => {
            setConfirmSpec(null)
            const sp = await window.nexterm.gitc.stashPush(projectPath, 'auto-stash before applying ' + ref, true)
            if (!sp?.ok) { setError(sp?.error || 'auto-stash failed'); return }
            const r2 = await window.nexterm.gitc.stashApply(projectPath, ref, pop)
            if (!r2?.ok) { setError(r2?.error || 'apply failed after auto-stash') }
            refresh(); loadStashes()
          }
        })
        return
      }
      setError(msg)
      return
    }
    refresh(); loadStashes()
  }

  function dropStash(ref) {
    setConfirmSpec({
      message: `Drop ${ref}?`,
      detail: 'This deletes the stash without applying. Cannot be undone.',
      danger: true,
      confirmLabel: 'Drop',
      onConfirm: async () => {
        setConfirmSpec(null)
        const r = await window.nexterm.gitc.stashDrop(projectPath, ref)
        if (!r?.ok) { setError(r?.error || 'stash drop failed'); return }
        loadStashes()
      }
    })
  }

  async function discardAllChanges() {
    const ok = await window.nexterm.confirm({
      message: 'Discard ALL changes in working tree?',
      detail: 'This resets every modified file to HEAD and removes untracked files. Cannot be undone.'
    })
    if (!ok) return
    const r = await window.nexterm.gitc.discardAll(projectPath, true)
    if (!r?.ok) { setError(r?.error || 'discard failed'); return }
    refresh()
  }

  async function resolveConflict(path, side) {
    const r = await window.nexterm.gitc.resolveConflict(projectPath, path, side)
    if (!r?.ok) { setError(r?.error || 'resolve failed'); return }
    refresh()
  }

  function revertCommit(hash) {
    setCommitMenu(null)
    setConfirmSpec({
      message: `Revert commit ${hash.slice(0,7)}?`,
      detail: 'Creates a new commit that undoes the changes from this commit.',
      confirmLabel: 'Revert',
      onConfirm: async () => {
        setConfirmSpec(null)
        const r = await window.nexterm.gitc.revert(projectPath, hash)
        if (!r?.ok) { setError(r?.error || 'revert failed'); return }
        refresh()
      }
    })
  }

  async function cherryPickCommit(hash) {
    setCommitMenu(null)
    const r = await window.nexterm.gitc.cherryPick(projectPath, hash)
    if (!r?.ok) { setError(r?.error || 'cherry-pick failed'); return }
    refresh()
  }

  // Load stashes whenever the panel mounts / status changes
  useEffect(() => { if (status?.isRepo) loadStashes() }, [status?.headHash])

  // Dismiss branch picker on outside click — must exclude both the portal
  // (branchPopRef) AND the pill button (pillBtnRef) so the pill's own onClick
  // toggle isn't fought by this dismiss handler.
  useEffect(() => {
    if (!branchPickerOpen) return
    function onDoc(e) {
      const t = e.target
      if (branchPopRef.current?.contains(t)) return
      if (pillBtnRef.current?.contains(t)) return
      setBranchPickerOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [branchPickerOpen])

  async function doSync(action) {
    setError(null); setSyncBusy(action)
    try {
      let r
      if      (action === 'push')  r = await window.nexterm.gitc.push(projectPath, true)
      else if (action === 'pull')  r = await window.nexterm.gitc.pull(projectPath)
      else if (action === 'fetch') r = await window.nexterm.gitc.fetch(projectPath)
      if (!r?.ok) setError(r?.error || `${action} failed`)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSyncBusy(null)
      refresh()
    }
  }

  function viewFileDiff(file) {
    setDiffSpec({
      title: `${file.path} · ${file.staged ? 'staged' : 'working tree'}`,
      loader: () => window.nexterm.gitc.diffFile(projectPath, file.path, !!file.staged)
    })
  }

  function viewCommitDiff(commit) {
    setDiffSpec({
      title: `${commit.shortHash} · ${commit.subject}`,
      loader: () => window.nexterm.gitc.commitDiff(projectPath, commit.hash)
    })
  }

  async function doUnstageAll() {
    const stagedPaths = (status?.files || []).filter(f => f.staged).map(f => f.path)
    if (stagedPaths.length === 0) return
    await window.nexterm.gitc.unstage(projectPath, stagedPaths)
    refresh()
  }
  async function doDiscard(path) {
    const ok = await window.nexterm.confirm({
      message: `Discard changes to ${path}?`,
      detail: 'This restores the file to its last committed state. Cannot be undone.'
    })
    if (!ok) return
    await window.nexterm.gitc.discard(projectPath, path); refresh()
  }

  function statusBadge(file) {
    const ch = file.staged ? file.index : (file.working || '?')
    const map = {
      'M': { label: 'M', cls: 'sc-modified', title: 'Modified' },
      'A': { label: 'A', cls: 'sc-added',    title: 'Added' },
      'D': { label: 'D', cls: 'sc-deleted',  title: 'Deleted' },
      'R': { label: 'R', cls: 'sc-renamed',  title: 'Renamed' },
      'C': { label: 'C', cls: 'sc-copied',   title: 'Copied' },
      'U': { label: 'U', cls: 'sc-conflict', title: 'Unmerged' },
      '?': { label: 'U', cls: 'sc-untracked',title: 'Untracked' }
    }
    return map[ch] || map['?']
  }

  function fileBasename(p) { return p.split(/[\\/]/).pop() }
  function fileDir(p) {
    const idx = p.replace(/\\/g, '/').lastIndexOf('/')
    return idx >= 0 ? p.replace(/\\/g, '/').slice(0, idx) : ''
  }

  // ── Not a repo: render the init CTA ──────────────────────────────────
  if (status && !status.isRepo) {
    return (
      <div className="gitpanel gitpanel-empty">
        <div className="gp-header">
          <span className="gp-title">SOURCE CONTROL</span>
        </div>
        <div className="gp-init">
          <div className="gp-init-icon">⎇</div>
          <div className="gp-init-title">Not a git repository</div>
          <div className="gp-init-text">
            Initialize a git repository here to track changes, commit, and view history.
          </div>
          <button
            className="gp-init-btn"
            onClick={doInit}
            disabled={initializing}
          >
            {initializing ? 'Initializing…' : 'Initialize Repository'}
          </button>
          {error && <div className="gp-error">{error}</div>}
        </div>
      </div>
    )
  }

  const files = status?.files || []
  const staged   = files.filter(f => f.staged)
  const unstaged = files.filter(f => !f.staged)

  return (
    <div className="gitpanel" ref={panelRef}>
      <div className="gp-header">
        <span className="gp-title">SOURCE CONTROL</span>
        <button
          className={`gp-icon-btn ${syncBusy === 'fetch' ? 'busy' : ''}`}
          onClick={() => doSync('fetch')}
          disabled={!!syncBusy}
          title="Fetch from remote"
        ><IconFetch /></button>
        <button
          className={`gp-icon-btn ${syncBusy === 'pull' ? 'busy' : ''}`}
          onClick={() => doSync('pull')}
          disabled={!!syncBusy}
          title="Pull (fast-forward only)"
        ><IconPull /></button>
        <button
          className={`gp-icon-btn ${syncBusy === 'push' ? 'busy' : ''}`}
          onClick={() => doSync('push')}
          disabled={!!syncBusy}
          title="Push to remote"
        ><IconPush /></button>
        <button className="gp-icon-btn" onClick={refresh} disabled={!!syncBusy} title="Refresh"><IconRefresh /></button>
      </div>


      {/* Commit message (with inline AI icon) + Commit button */}
      <div className="gp-commit">
        <div className="gp-commit-box">
          <textarea
            className="gp-commit-input"
            placeholder="Commit message (Ctrl+Enter to commit)"
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doCommit() } }}
          />
          <button
            className={`gp-ai-icon ${aiBusy ? 'busy' : ''}`}
            onClick={generateCommitMessage}
            disabled={aiBusy || files.length === 0}
            title={`Generate commit message via ${aiModeLabel}`}
          >
            <IconSparkle />
          </button>
          {aiBusy && <div className="gp-ai-progress" />}
        </div>
        <div className="gp-ai-meta">
          <span className="gp-ai-meta-label">AI:</span>
          <span className="gp-ai-meta-model">{aiModeLabel}</span>
          {aiBusy && <span className="gp-ai-meta-status">writing…</span>}
        </div>
        <button
          className="gp-commit-btn"
          onClick={doCommit}
          disabled={busy || !commitMessage.trim() || files.length === 0}
          title={files.length === 0 ? 'Nothing to commit' : ''}
        >
          {busy ? 'Committing…' : '✓ Commit'}
        </button>
      </div>

      {error && <div className="gp-error">{error}</div>}

      {/* Middle area: changes section OR empty state. Grows to push History
          to the bottom of the panel. */}
      {files.length > 0 ? (
        <div className="gp-section">
          <div className="gp-section-head">
            <span>Changes</span>
            <span className="gp-count">{files.length}</span>
            <span style={{ flex: 1 }} />
            <button
              className="gp-mini"
              onClick={stashChanges}
              disabled={files.length === 0}
              title="Stash all changes"
            >📦</button>
            <button
              className="gp-mini"
              onClick={doUnstageAll}
              disabled={staged.length === 0}
              title={staged.length === 0 ? 'Nothing staged' : `Unstage all (${staged.length})`}
            ><IconMinus /></button>
            <button
              className="gp-mini"
              onClick={doStageAll}
              disabled={unstaged.length === 0}
              title={unstaged.length === 0 ? 'Everything is staged' : `Stage all changes (${unstaged.length})`}
            ><IconPlus /></button>
          </div>
          <div className="gp-section-body">

          {staged.length > 0 && (
            <div className="gp-subsection">
              <div className="gp-sub-head">Staged ({staged.length})</div>
              {staged.map(f => {
                const b = statusBadge(f)
                return (
                  <div key={'s-' + f.path} className="gp-file-row" onClick={() => viewFileDiff(f)} title={f.path}>
                    <span className={`sc-badge ${b.cls}`} title={b.title}>{b.label}</span>
                    <span
                      className="gp-file-name"
                      onClick={(e) => { e.stopPropagation(); onOpenFile?.(joinProject(projectPath, f.path)) }}
                    >{fileBasename(f.path)}</span>
                    <span className="gp-file-dir">{fileDir(f.path)}</span>
                    <span className="gp-file-actions-group">
                      <button
                        className="gp-file-action"
                        onClick={(e) => { e.stopPropagation(); doUnstage(f.path) }}
                        title="Unstage"
                      ><IconMinus /></button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {unstaged.length > 0 && (
            <div className="gp-subsection">
              {unstaged.map(f => {
                const b = statusBadge(f)
                const isConflict = f.index === 'U' || f.working === 'U' || (f.index && f.working && f.index !== '?' && f.working !== '?')
                return (
                  <div key={'u-' + f.path} className={`gp-file-row ${isConflict ? 'conflict' : ''}`} onClick={() => viewFileDiff(f)} title={f.path}>
                    <span className={`sc-badge ${b.cls}`} title={b.title}>{b.label}</span>
                    <span
                      className="gp-file-name"
                      onClick={(e) => { e.stopPropagation(); onOpenFile?.(joinProject(projectPath, f.path)) }}
                    >{fileBasename(f.path)}</span>
                    <span className="gp-file-dir">{fileDir(f.path)}</span>
                    <span className={`gp-file-actions-group ${isConflict ? 'always' : ''}`}>
                      {isConflict ? (
                        <>
                          <button
                            className="gp-file-action"
                            onClick={(e) => { e.stopPropagation(); resolveConflict(f.path, 'ours') }}
                            title="Accept OUR side (current branch)"
                            style={{ color: '#22c55e' }}
                          >M</button>
                          <button
                            className="gp-file-action"
                            onClick={(e) => { e.stopPropagation(); resolveConflict(f.path, 'theirs') }}
                            title="Accept THEIR side (incoming)"
                            style={{ color: '#3b82f6' }}
                          >T</button>
                        </>
                      ) : (
                        <>
                          <button
                            className="gp-file-action"
                            onClick={(e) => { e.stopPropagation(); doDiscard(f.path) }}
                            title="Discard changes"
                          ><IconDiscard /></button>
                          <button
                            className="gp-file-action"
                            onClick={(e) => { e.stopPropagation(); doStage(f.path) }}
                            title="Stage"
                          ><IconPlus /></button>
                        </>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      ) : (
        <div className="gp-clean">
          <div className="gp-clean-icon">✓</div>
          <div className="gp-clean-text">Working tree clean</div>
        </div>
      )}

      {/* Drag handle between Changes and History */}
      {!historyCollapsed && (
        <div
          className="gp-resize-handle"
          onMouseDown={startResizeHistory}
          title="Drag to resize history"
        />
      )}

      {/* Commit history — collapsible + resizable section pinned at the bottom */}
      <div
        className={`gp-section gp-history-section ${historyCollapsed ? 'collapsed' : ''}`}
        style={historyCollapsed ? undefined : { flex: `0 0 ${historyHeight}px` }}
      >
        <div className="gp-section-head gp-history-head" onClick={() => setHistoryCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
          <svg
            className={`gp-collapse-caret ${historyCollapsed ? 'collapsed' : ''}`}
            width="14" height="14" viewBox="0 0 16 16"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          <span>History</span>
          <span className="gp-count">{log.length}</span>
          <span style={{ flex: 1 }} />
          <span
            className="gp-branch-pill-wrap"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span
              ref={pillBtnRef}
              className="gp-branch-pill gp-branch-pill-clickable"
              title="Switch branch · create new branch"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                if (branchPickerOpen) setBranchPickerOpen(false)
                else openBranchPicker()
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="4" cy="3" r="1.6" />
                <circle cx="4" cy="13" r="1.6" />
                <circle cx="12" cy="8" r="1.6" />
                <path d="M4 5v6M5.5 3.6h4.5a2.5 2.5 0 0 1 0 5h-3" />
              </svg>
              <span className="gp-branch-name">{status?.branch || '(detached)'}</span>
              {status?.headHash && <span className="gp-headhash-inline">{status.headHash}</span>}
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, opacity: 0.55 }}>
                <path d="M4 6l4 4 4-4" />
              </svg>
            </span>
          </span>
          {branchPickerOpen && pillRect && createPortal(
            (() => {
              const POP_HEIGHT_GUESS = 320
              const flipUp = pillRect.bottom + POP_HEIGHT_GUESS > window.innerHeight - 8
              const style = flipUp
                ? { bottom: window.innerHeight - pillRect.top + 4, right: window.innerWidth - pillRect.right }
                : { top: pillRect.bottom + 4, right: window.innerWidth - pillRect.right }
              return (
                <div
                  ref={branchPopRef}
                  className="gp-branch-pop"
                  style={style}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!newBranchMode ? (
                    <>
                      <div className="gp-branch-pop-search">
                        <button className="gp-branch-pop-new" onClick={() => setNewBranchMode(true)}>＋ Create new branch…</button>
                      </div>
                      <div className="gp-branch-pop-section-label">Local</div>
                      {branches.local.length === 0 && <div className="gp-branch-pop-empty">No local branches</div>}
                      {branches.local.map(b => {
                        const isRenaming = renameTarget === b.name
                        return (
                          <div
                            key={'l-' + b.name}
                            className={`gp-branch-pop-item ${b.current ? 'current' : ''} ${isRenaming ? 'renaming' : ''}`}
                            onClick={() => { if (!isRenaming && !b.current) switchBranch(b.name, false) }}
                          >
                            <span className="gp-branch-pop-tick">{b.current ? '●' : ' '}</span>
                            {isRenaming ? (
                              <input
                                autoFocus
                                className="gp-branch-rename-input"
                                value={renameValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') commitRenameBranch()
                                  else if (e.key === 'Escape') cancelRename()
                                }}
                                onBlur={commitRenameBranch}
                              />
                            ) : (
                              <>
                                <span className="gp-branch-pop-name">{b.name}</span>
                                {b.upstream && <span className="gp-branch-pop-upstream">{b.upstream}</span>}
                                <button
                                  className="gp-branch-rename-btn"
                                  onClick={(e) => { e.stopPropagation(); startRenameBranch(b.name) }}
                                  title="Rename branch"
                                >
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 2l3 3-9 9H2v-3z" />
                                    <path d="M9 4l3 3" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                      {branches.remote.length > 0 && (
                        <>
                          <div className="gp-branch-pop-section-label">Remote</div>
                          {branches.remote.map(b => {
                            const localName = b.name.replace(/^origin\//, '')
                            if (branches.local.some(l => l.name === localName)) return null
                            return (
                              <div key={'r-' + b.name} className="gp-branch-pop-item" onClick={() => switchBranch(b.name, true)}>
                                <span className="gp-branch-pop-tick"> </span>
                                <span className="gp-branch-pop-name">{b.name}</span>
                                <span className="gp-branch-pop-upstream">checkout</span>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="gp-branch-pop-new-form">
                      <div className="gp-branch-pop-section-label">New branch from HEAD</div>
                      <input
                        autoFocus
                        className="gp-branch-pop-input"
                        placeholder="my-feature"
                        value={newBranchName}
                        onChange={e => setNewBranchName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createNewBranch()
                          else if (e.key === 'Escape') { setNewBranchMode(false); setNewBranchName('') }
                        }}
                      />
                      <div className="gp-branch-pop-actions">
                        <button onClick={() => { setNewBranchMode(false); setNewBranchName('') }}>Cancel</button>
                        <button className="primary" onClick={createNewBranch} disabled={!newBranchName.trim()}>Create</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })(),
            document.body
          )}
          {status?.ahead > 0 && (
            <span className="gp-syncbadge ahead" title={`${status.ahead} ahead`} onClick={(e) => e.stopPropagation()}>↑{status.ahead}</span>
          )}
          {status?.behind > 0 && (
            <span className="gp-syncbadge behind" title={`${status.behind} behind`} onClick={(e) => e.stopPropagation()}>↓{status.behind}</span>
          )}
        </div>
        {!historyCollapsed && (
        <div className="gp-timeline">
          {log.length === 0 && (
            <div className="gp-empty">No commits yet</div>
          )}
          {log.map((c, i) => {
            const isExpanded = expandedCommit === c.hash
            const isHead = i === 0
            return (
              <div
                key={c.hash}
                className={`gp-commit-row ${isHead ? 'head' : ''} ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedCommit(isExpanded ? null : c.hash)}
                onContextMenu={(e) => { e.preventDefault(); setCommitMenu({ hash: c.hash, x: e.clientX, y: e.clientY, subject: c.subject }) }}
              >
                <span className="gp-commit-dot" />
                <div className="gp-commit-info">
                  <div className="gp-commit-subject">{c.subject}</div>
                  <div className="gp-commit-meta">
                    <span className="gp-commit-hash">{c.shortHash}</span>
                    <span className="gp-commit-author">{c.author}</span>
                    <span className="gp-commit-date">{c.relDate}</span>
                  </div>
                </div>
                <button
                  className="gp-commit-diff"
                  onClick={(e) => { e.stopPropagation(); viewCommitDiff(c) }}
                  title="View diff"
                >⤢</button>
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* Stash section — collapsible, matches the History section style */}
      {stashes.length > 0 && (
        <div className={`gp-section gp-stash-section ${stashOpen ? '' : 'collapsed'}`} style={stashOpen ? undefined : { flex: '0 0 auto' }}>
          <div className="gp-section-head" onClick={() => setStashOpen(s => !s)} style={{ cursor: 'pointer' }}>
            <svg
              className={`gp-collapse-caret ${stashOpen ? '' : 'collapsed'}`}
              width="14" height="14" viewBox="0 0 16 16"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
            <span>Stashes</span>
            <span className="gp-count">{stashes.length}</span>
          </div>
          {stashOpen && (
            <div className="gp-stash-list">
              {stashes.map(s => (
                <div key={s.ref} className="gp-stash-item" title={s.ref}>
                  <span className="gp-stash-subject">{s.subject}</span>
                  <span className="gp-stash-date">{s.relDate}</span>
                  <button
                    className="gp-file-action"
                    onClick={() => applyStash(s.ref, false)}
                    title="Apply — restore these changes and keep the stash for later"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8a5 5 0 1 0 5-5" />
                      <path d="M8 1l-2.5 2.5L8 6" />
                    </svg>
                  </button>
                  <button
                    className="gp-file-action"
                    onClick={() => applyStash(s.ref, true)}
                    title="Pop — restore these changes AND delete the stash"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 13V3M4 7l4-4 4 4" />
                    </svg>
                  </button>
                  <button
                    className="gp-file-action danger"
                    onClick={() => dropStash(s.ref)}
                    title="Drop — DELETE the stash without applying (changes are LOST)"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4l1 9h4l1-9" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Commit context menu (right-click) */}
      {commitMenu && (
        <>
          <div className="gp-ctx-backdrop" onMouseDown={() => setCommitMenu(null)} />
          <div className="gp-ctx-menu" style={{ left: commitMenu.x, top: commitMenu.y }}>
            <div className="gp-ctx-head">{commitMenu.subject?.slice(0, 60) || commitMenu.hash.slice(0, 7)}</div>
            <div className="gp-ctx-item" onClick={() => { viewCommitDiff({ hash: commitMenu.hash, shortHash: commitMenu.hash.slice(0, 7), subject: commitMenu.subject || '' }); setCommitMenu(null) }}>View diff</div>
            <div className="gp-ctx-item" onClick={() => cherryPickCommit(commitMenu.hash)}>Cherry-pick onto current branch</div>
            <div className="gp-ctx-item danger" onClick={() => revertCommit(commitMenu.hash)}>Revert this commit</div>
            <div className="gp-ctx-item" onClick={() => { navigator.clipboard?.writeText(commitMenu.hash); setCommitMenu(null) }}>Copy full hash</div>
          </div>
        </>
      )}

      {diffSpec && (
        <DiffViewer
          title={diffSpec.title}
          loader={diffSpec.loader}
          onClose={() => setDiffSpec(null)}
        />
      )}

      {confirmSpec && (
        <InlineConfirm
          message={confirmSpec.message}
          detail={confirmSpec.detail}
          confirmLabel={confirmSpec.confirmLabel}
          danger={confirmSpec.danger}
          onConfirm={confirmSpec.onConfirm}
          onCancel={() => setConfirmSpec(null)}
        />
      )}
    </div>
  )
}

function joinProject(proj, rel) {
  const p = proj.replace(/[\\/]$/, '')
  const sep = proj.includes('\\') ? '\\' : '/'
  return p + sep + rel.replace(/[\\/]/g, sep)
}
