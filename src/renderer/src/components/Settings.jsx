import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { THEMES } from '../themes'
import AnsiText from './AnsiText'
import { ACTIONS, getKey, formatCombo } from '../shortcuts'
import GpuRuntimeManager from './GpuRuntimeManager'

const SHELLS = [
  { label: 'PowerShell 7 (pwsh)',  value: 'pwsh.exe' },
  { label: 'PowerShell 5',         value: 'powershell.exe' },
  { label: 'Command Prompt (CMD)', value: 'cmd.exe' },
  { label: 'Git Bash',             value: 'C:\\Program Files\\Git\\bin\\bash.exe' },
  { label: 'WSL (Default)',        value: 'wsl.exe' },
]

const FONTS = [
  'Cascadia Code',
  'Cascadia Mono',
  'Consolas',
  'Courier New',
  'Fira Code',
  'JetBrains Mono',
  'Source Code Pro',
  'Hack',
  'Inconsolata',
]

const SECTIONS = ['Appearance', 'Window', 'Startup', 'Font', 'Terminal', 'Shell', 'AI', 'Coder', 'Aliases', 'Bookmarks', 'Snippets', 'Workspaces', 'Notifications', 'Vault', 'History', 'Shortcuts', 'Config']

const SHELL_PRESETS = [
  { value: 'powershell.exe',                          label: 'PowerShell' },
  { value: 'pwsh.exe',                                label: 'PowerShell 7' },
  { value: 'cmd.exe',                                 label: 'Command Prompt' },
  { value: 'C:\\Program Files\\Git\\bin\\bash.exe',   label: 'Git Bash' },
  { value: 'wsl.exe',                                 label: 'WSL' }
]

const SIZE_PRESETS = [
  { v: 'small',  l: 'Small',  desc: '800 × 500'  },
  { v: 'medium', l: 'Medium', desc: '1280 × 800' },
  { v: 'large',  l: 'Large',  desc: '1600 × 900' },
  { v: 'max',    l: 'Maximized', desc: 'Fill screen' },
  { v: 'custom', l: 'Custom', desc: 'Set width/height' }
]

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  )
}

// Live preview of the picked window-button style — uses the same SVG icons + CSS classes as the title bar
const PreviewMin   = () => <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1"/></svg>
const PreviewMax   = () => <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
const PreviewClose = () => <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/><line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/></svg>

function FontPreview({ settings }) {
  const fontFamily = settings.fontFamily || 'Cascadia Code, monospace'
  const fontSize   = settings.fontSize   || 14
  const lineHeight = settings.lineHeight || 1.2
  const cursor     = settings.cursorStyle || 'block'
  const blink      = settings.cursorBlink !== false

  const cursorChar = cursor === 'block' ? '█' : cursor === 'underline' ? '▁' : '▎'

  return (
    <div className="font-preview" style={{ fontFamily, fontSize, lineHeight }}>
      <div>$ <span style={{ color: 'var(--c-bgreen)' }}>echo</span> "Hello, NexTerm!"</div>
      <div>Hello, NexTerm!</div>
      <div style={{ color: 'var(--c-byellow)' }}>// 0123456789  &lt;&gt;()[]&#123;&#125; =&gt; *_-+</div>
      <div>
        $ <span className={blink ? 'font-cursor blink' : 'font-cursor'} data-style={cursor}>{cursorChar}</span>
      </div>
    </div>
  )
}

function ButtonStylePreview({ style }) {
  const macLike = style === 'mac' || style === 'macIcons'
  return (
    <div className="btn-preview-bar">
      <div className={`win-controls win-style-${style}`}>
        {macLike ? (
          <>
            <button className="win-btn close"    type="button"><span className="mac-icon">×</span></button>
            <button className="win-btn minimize" type="button"><span className="mac-icon">−</span></button>
            <button className="win-btn maximize" type="button"><span className="mac-icon">+</span></button>
          </>
        ) : (
          <>
            <button className="win-btn minimize" type="button"><PreviewMin /></button>
            <button className="win-btn maximize" type="button"><PreviewMax /></button>
            <button className="win-btn close"    type="button"><PreviewClose /></button>
          </>
        )}
      </div>
    </div>
  )
}

function AliasesSection({ settings, set }) {
  const a = settings.aliases || { global: [], projects: [] }

  // ── Global aliases ──
  function addGlobal()       { setG([...(a.global || []), { name: '', command: '' }]) }
  function rmGlobal(i)       { setG(a.global.filter((_, j) => j !== i)) }
  function updGlobal(i, k, v){ setG(a.global.map((x, j) => j === i ? { ...x, [k]: v } : x)) }
  function setG(global)      { set({ aliases: { ...a, global } }) }

  // ── Project aliases ──
  function addProject() {
    setProjects([...(a.projects || []), {
      id: `p-${Date.now()}`, name: 'New Project', path: '', aliases: []
    }])
  }
  function rmProject(i)     { setProjects(a.projects.filter((_, j) => j !== i)) }
  function updProject(i, k, v) {
    setProjects(a.projects.map((p, j) => j === i ? { ...p, [k]: v } : p))
  }
  function setProjects(projects) { set({ aliases: { ...a, projects } }) }

  function addProjectAlias(pi) {
    setProjects(a.projects.map((p, j) => j === pi
      ? { ...p, aliases: [...(p.aliases || []), { name: '', command: '' }] } : p))
  }
  function rmProjectAlias(pi, ai) {
    setProjects(a.projects.map((p, j) => j === pi
      ? { ...p, aliases: p.aliases.filter((_, k) => k !== ai) } : p))
  }
  function updProjectAlias(pi, ai, k, v) {
    setProjects(a.projects.map((p, j) => j === pi
      ? { ...p, aliases: p.aliases.map((x, k2) => k2 === ai ? { ...x, [k]: v } : x) }
      : p))
  }

  return (
    <div className="settings-group">
      <p className="section-title">Global Aliases</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Type the alias name and press Enter — it expands to the full command.
        Active in every shell.
      </div>

      <div className="alias-list">
        {(a.global || []).map((al, i) => (
          <div key={i} className="alias-row">
            <input
              className="settings-input alias-name"
              placeholder="dev"
              value={al.name}
              onChange={e => updGlobal(i, 'name', e.target.value.trim())}
            />
            <span className="dim">→</span>
            <input
              className="settings-input alias-cmd"
              placeholder="npm run dev"
              value={al.command}
              onChange={e => updGlobal(i, 'command', e.target.value)}
            />
            <button className="icon-btn" onClick={() => rmGlobal(i)} title="Delete">🗑</button>
          </div>
        ))}
        <button className="btn-secondary" onClick={addGlobal} style={{ alignSelf: 'flex-start' }}>+ Add alias</button>
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>Project Aliases</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Active only when the current folder matches the project path.
        Project aliases override global ones with the same name.
      </div>

      {(a.projects || []).map((p, pi) => (
        <div key={p.id || pi} className="alias-project">
          <div className="alias-project-head">
            <input
              className="settings-input"
              placeholder="Project name"
              value={p.name || ''}
              onChange={e => updProject(pi, 'name', e.target.value)}
              style={{ flex: '0 0 160px' }}
            />
            <input
              className="settings-input"
              placeholder="C:\path\to\project"
              value={p.path || ''}
              onChange={e => updProject(pi, 'path', e.target.value)}
              style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 11 }}
            />
            <button className="icon-btn" onClick={() => rmProject(pi)} title="Delete project">🗑</button>
          </div>

          <div className="alias-list" style={{ paddingLeft: 18, marginTop: 6 }}>
            {(p.aliases || []).map((al, ai) => (
              <div key={ai} className="alias-row">
                <input
                  className="settings-input alias-name"
                  placeholder="dev"
                  value={al.name}
                  onChange={e => updProjectAlias(pi, ai, 'name', e.target.value.trim())}
                />
                <span className="dim">→</span>
                <input
                  className="settings-input alias-cmd"
                  placeholder="npm run dev"
                  value={al.command}
                  onChange={e => updProjectAlias(pi, ai, 'command', e.target.value)}
                />
                <button className="icon-btn" onClick={() => rmProjectAlias(pi, ai)} title="Delete">🗑</button>
              </div>
            ))}
            <button
              className="btn-secondary"
              onClick={() => addProjectAlias(pi)}
              style={{ alignSelf: 'flex-start', fontSize: 11 }}
            >+ Add alias</button>
          </div>
        </div>
      ))}

      <button className="btn-primary" onClick={addProject} style={{ alignSelf: 'flex-start', marginTop: 8 }}>+ Add project</button>
    </div>
  )
}

function ConfigSection({ settings, setSettings }) {
  const [path, setPath] = useState('')

  useEffect(() => { window.nexterm.settings.path().then(setPath) }, [])

  async function exportCfg() {
    const r = await window.nexterm.settings.export()
    if (r.ok) await window.nexterm.info({ message: 'Settings exported', detail: r.path })
  }

  async function importCfg() {
    const ok = await window.nexterm.confirm({
      message: 'Import settings file?',
      detail: 'This OVERWRITES your current settings. Profiles, history, and vault are not affected.',
      danger: true
    })
    if (!ok) return
    const r = await window.nexterm.settings.import()
    if (r.ok) {
      const fresh = await window.nexterm.settings.get()
      setSettings(fresh)
      await window.nexterm.info({
        message: 'Settings imported',
        detail: 'Some changes (window size, blur) take effect on next launch.'
      })
    } else if (r.error) {
      await window.nexterm.info({ type: 'error', message: 'Import failed', detail: r.error })
    }
  }

  async function resetAll() {
    const ok = await window.nexterm.confirm({
      message: 'Reset all settings to defaults?',
      detail: 'Your history, profiles, and vault are not affected.',
      danger: true
    })
    if (!ok) return
    await window.nexterm.settings.reset()
    const fresh = await window.nexterm.settings.get()
    setSettings(fresh)
    await window.nexterm.info({
      message: 'Settings reset',
      detail: 'Some changes take effect on next launch.'
    })
  }

  // Pretty-print a friendly subset of the config (the kind of JSON the README implies)
  const summary = {
    theme: settings.theme,
    fontSize: settings.fontSize,
    fontFamily: (settings.fontFamily || '').split(',')[0].trim(),
    shell: settings.defaultShell,
    cursorStyle: settings.cursorStyle,
    saveHistory: settings.saveHistory,
    suggestions: settings.suggestions,
    showBanner: settings.showBanner,
    bannerLogo: settings.bannerLogo
  }

  return (
    <div className="settings-group">
      <p className="section-title">Config File</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Every preference you set is persisted as JSON. You can edit it by hand, share it,
        or back it up.
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">File Location</div>
          <div className="settings-desc" style={{
            fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all'
          }}>{path || '…'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary" onClick={() => window.nexterm.settings.openEditor()}>Open</button>
          <button className="btn-secondary" onClick={() => window.nexterm.settings.reveal()}>Reveal</button>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Backup / Restore</div>
          <div className="settings-desc">
            Export to a JSON file you can keep, or import one back to overwrite.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary" onClick={exportCfg}>Export…</button>
          <button className="btn-secondary" onClick={importCfg}>Import…</button>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Reset</div>
          <div className="settings-desc">
            Reset all settings to defaults. History, profiles, and vault are kept.
          </div>
        </div>
        <button className="btn-danger" onClick={resetAll}>Reset to Defaults</button>
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>Current Snapshot</p>
      <pre style={{
        background: 'color-mix(in srgb, var(--bg) 80%, #000 20%)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 12,
        fontSize: 11,
        fontFamily: 'Cascadia Code, Consolas, monospace',
        margin: 0,
        whiteSpace: 'pre-wrap',
        userSelect: 'text'
      }}>{JSON.stringify(summary, null, 2)}</pre>
      <div className="settings-desc" style={{ opacity: 0.55, marginTop: 6 }}>
        Showing a friendly subset. The actual file has every setting (themes, aliases,
        bookmarks, profiles, etc.) — open it for the full picture.
      </div>
    </div>
  )
}

function BookmarksSection({ settings, set }) {
  const bookmarks = settings.bookmarks || []

  function add()        { set({ bookmarks: [...bookmarks, { name: '', path: '' }] }) }
  function remove(i)    { set({ bookmarks: bookmarks.filter((_, j) => j !== i) }) }
  function upd(i, k, v) { set({ bookmarks: bookmarks.map((b, j) => j === i ? { ...b, [k]: v } : b) }) }

  function go(b) {
    if (!b.path) return
    const { tabs, activeId } = useStore.getState()
    const tab = tabs.find(t => t.id === activeId)
    const paneId = tab?.activePane
    if (!paneId) return
    // Quote the path in single quotes (PowerShell-friendly) and escape any '
    const psQuoted = `'${b.path.replace(/'/g, "''")}'`
    window.nexterm.pty.write(paneId, `Set-Location ${psQuoted}\r`)
  }

  return (
    <div className="settings-group">
      <p className="section-title">Directory Bookmarks</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Type <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>goto &lt;name&gt;</code>
        {' '}in any PowerShell tab to jump there. Type just <code>goto</code> alone to list all bookmarks.
      </div>

      <div className="alias-list">
        {bookmarks.map((b, i) => (
          <div key={i} className="alias-row">
            <input
              className="settings-input alias-name"
              placeholder="nexterm"
              value={b.name}
              onChange={e => upd(i, 'name', e.target.value.trim())}
            />
            <span className="dim">→</span>
            <input
              className="settings-input alias-cmd"
              placeholder="C:\Users\LOQ\Documents\GitHub\NexTerm"
              value={b.path}
              onChange={e => upd(i, 'path', e.target.value)}
            />
            <button
              className="btn-secondary"
              onClick={() => go(b)}
              disabled={!b.path}
              title="Jump to this path in the active terminal"
              style={{ padding: '4px 10px' }}
            >
              Go
            </button>
            <button className="icon-btn" onClick={() => remove(i)} title="Delete">🗑</button>
          </div>
        ))}
        <button className="btn-secondary" onClick={add} style={{ alignSelf: 'flex-start' }}>+ Add bookmark</button>
      </div>

      <div className="settings-desc" style={{ marginTop: 14, opacity: 0.55 }}>
        Open a new tab after editing for the <code>goto</code> command to refresh.
      </div>
    </div>
  )
}

function VaultSection({ settings, set }) {
  const [secrets, setSecrets] = useState([])
  const [revealed, setRevealed] = useState({})
  const [adding, setAdding] = useState(null)

  async function load() {
    try { setSecrets(await window.nexterm.vault.list()) } catch { setSecrets([]) }
  }
  useEffect(() => { load() }, [])

  async function reveal(name) {
    if (revealed[name] !== undefined) {
      setRevealed(r => { const { [name]: _, ...rest } = r; return rest })
      return
    }
    const v = await window.nexterm.vault.get(name)
    setRevealed(r => ({ ...r, [name]: v ?? '(decryption failed)' }))
  }

  async function save(form) {
    if (!form.name) return
    const r = await window.nexterm.vault.set(form)
    if (r.ok) {
      setAdding(null)
      load()
    } else {
      await window.nexterm.info({ type: 'error', message: 'Could not save secret', detail: r.error || 'unknown' })
    }
  }

  async function remove(name) {
    const ok = await window.nexterm.confirm({
      message: `Delete secret "${name}"?`,
      detail: 'This permanently removes the encrypted secret from your vault.',
      danger: true
    })
    if (!ok) return
    await window.nexterm.vault.delete(name)
    load()
  }

  function copy(value) {
    navigator.clipboard.writeText(value)
  }

  return (
    <div className="settings-group">
      <p className="section-title">Secure Vault</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Secrets are encrypted via your OS keychain (Windows DPAPI / macOS Keychain).
        They never leave this machine in plaintext.
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Inject as Environment Variables</div>
          <div className="settings-desc">
            When ON, every new shell tab gets all secrets injected as env vars
            (e.g. <code>$env:GITHUB_TOKEN</code>). Off = secrets only accessible via the vault UI.
          </div>
        </div>
        <Toggle
          checked={settings.injectSecrets === true}
          onChange={(v) => set({ injectSecrets: v })}
        />
      </div>

      <p className="section-title" style={{ marginTop: 14 }}>Stored Secrets ({secrets.length})</p>

      {secrets.length === 0 && !adding && (
        <div className="settings-desc" style={{ opacity: 0.5, padding: '8px 0' }}>
          No secrets yet. Click <strong>+ Add Secret</strong> to store one.
        </div>
      )}

      {secrets.map(s => (
        <div key={s.id} className="settings-row" style={{
          padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 6
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-label" style={{ fontFamily: 'monospace' }}>{s.name}</div>
            {s.description && <div className="settings-desc">{s.description}</div>}
            {revealed[s.name] !== undefined && (
              <div style={{ marginTop: 6, padding: '4px 8px',
                background: 'color-mix(in srgb, var(--surface) 80%, #000 20%)',
                borderRadius: 4, fontFamily: 'monospace', fontSize: 11,
                wordBreak: 'break-all', userSelect: 'all' }}>
                {revealed[s.name]}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn" onClick={() => reveal(s.name)} title="Show / hide">
              {revealed[s.name] !== undefined ? '🙈' : '👁'}
            </button>
            <button className="icon-btn" onClick={async () => {
              const v = revealed[s.name] ?? await window.nexterm.vault.get(s.name)
              if (v) copy(v)
            }} title="Copy to clipboard">📋</button>
            <button className="icon-btn" onClick={() => remove(s.name)} title="Delete">🗑</button>
          </div>
        </div>
      ))}

      {adding ? (
        <SecretForm initial={adding} onCancel={() => setAdding(null)} onSave={save} />
      ) : (
        <button
          className="btn-primary"
          onClick={() => setAdding({ name: '', value: '', description: '' })}
          style={{ alignSelf: 'flex-start', marginTop: 10 }}
        >+ Add Secret</button>
      )}
    </div>
  )
}

function SecretForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="profile-form" style={{ marginTop: 10 }}>
      <div className="form-row">
        <label>Name *</label>
        <input
          className="settings-input"
          autoFocus
          placeholder="GITHUB_TOKEN"
          value={form.name}
          onChange={e => set('name', e.target.value.trim().toUpperCase())}
          style={{ fontFamily: 'monospace' }}
        />
      </div>
      <div className="form-row">
        <label>Value *</label>
        <input
          className="settings-input"
          type="password"
          placeholder="paste secret here"
          value={form.value}
          onChange={e => set('value', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Description</label>
        <input
          className="settings-input"
          placeholder="What is this for?"
          value={form.description || ''}
          onChange={e => set('description', e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  )
}

function CustomColors({ settings, set }) {
  const c = settings.customColors || {}
  const FIELDS = [
    { key: 'background',          label: 'Background' },
    { key: 'foreground',          label: 'Foreground (text)' },
    { key: 'cursor',              label: 'Cursor' },
    { key: 'cursorAccent',        label: 'Cursor Accent (typing text)' },
    { key: 'selectionBackground', label: 'Selection Background' }
  ]

  function setColor(key, value) {
    set({ customColors: { ...c, [key]: value || null } })
  }

  return (
    <div className="custom-colors">
      {FIELDS.map(f => (
        <div className="settings-row" key={f.key}>
          <div className="settings-label">{f.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              className="color-swatch"
              value={c[f.key] || '#000000'}
              onChange={e => setColor(f.key, e.target.value)}
            />
            <input
              type="text"
              className="settings-input"
              style={{ width: 100, fontSize: 11, fontFamily: 'monospace' }}
              placeholder="(theme)"
              value={c[f.key] || ''}
              onChange={e => setColor(f.key, e.target.value)}
            />
            <button
              className="icon-btn"
              onClick={() => setColor(f.key, null)}
              title="Reset to theme value"
              style={{ fontSize: 14 }}
            >↺</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ShortcutInput({ value, onCapture, conflict }) {
  const [capturing, setCapturing] = useState(false)
  const ref = useRef(null)

  function onKeyDown(e) {
    if (!capturing) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setCapturing(false); return }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      onCapture('')
      setCapturing(false)
      return
    }
    const combo = formatCombo(e)
    if (combo) {
      onCapture(combo)
      setCapturing(false)
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      className={`kbd-input ${capturing ? 'capturing' : ''} ${conflict ? 'conflict' : ''}`}
      onClick={() => { setCapturing(true); ref.current?.focus() }}
      onBlur={() => setCapturing(false)}
      onKeyDown={onKeyDown}
    >
      {capturing ? <span className="dim">Press keys… (Esc cancels)</span>
                 : value ? value : <span className="dim">unset</span>}
    </div>
  )
}

function ShortcutsSection({ settings, set }) {
  // Compute conflicts: any combo that maps to more than one action
  const currentMap = {}
  ACTIONS.forEach(a => { currentMap[a.id] = getKey(settings, a.id) })
  const counts = {}
  Object.values(currentMap).forEach(k => { if (k) counts[k] = (counts[k] || 0) + 1 })
  const conflicts = new Set(Object.keys(counts).filter(k => counts[k] > 1))

  function update(id, combo) {
    const next = { ...(settings.shortcuts || {}) }
    const def  = ACTIONS.find(a => a.id === id)?.default
    if (combo === def || combo === undefined) delete next[id]
    else next[id] = combo
    set({ shortcuts: next })
  }

  function reset(id) {
    const next = { ...(settings.shortcuts || {}) }
    delete next[id]
    set({ shortcuts: next })
  }

  return (
    <div className="settings-group">
      <p className="section-title">Keyboard Shortcuts</p>
      <div className="settings-desc" style={{ marginBottom: 12 }}>
        Click a shortcut to record. Esc to cancel, Backspace to clear.
        Conflicts are highlighted in red.
      </div>

      {ACTIONS.map(a => {
        const value    = currentMap[a.id]
        const conflict = value && conflicts.has(value)
        const isCustom = (settings.shortcuts || {})[a.id] !== undefined
        return (
          <div className="settings-row" key={a.id}>
            <div>
              <div className="settings-label">{a.label}</div>
              {conflict && (
                <div className="settings-desc" style={{ color: '#f7768e' }}>
                  ⚠ Same shortcut as: {ACTIONS.filter(x => currentMap[x.id] === value && x.id !== a.id).map(x => x.label).join(', ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShortcutInput
                value={value}
                conflict={conflict}
                onCapture={(c) => update(a.id, c)}
              />
              {isCustom && (
                <button
                  className="icon-btn"
                  onClick={() => reset(a.id)}
                  title="Reset to default"
                  style={{ fontSize: 14 }}
                >↺</button>
              )}
            </div>
          </div>
        )
      })}

      <div className="settings-desc" style={{ marginTop: 14, opacity: 0.55 }}>
        Non-customizable: Ctrl+Scroll = font size · Ctrl+Shift+Scroll = opacity ·
        Ctrl+C / Ctrl+V = copy/paste · Tab = accept suggestion (when one is shown).
      </div>
    </div>
  )
}

function StartupSection({ settings, set }) {
  const [profiles, setProfiles] = useState([])
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    window.nexterm.profile.list().then(setProfiles)
    window.nexterm.startup.get().then(setAutoStart)
  }, [])

  const dl = settings.defaultLaunch || { type: 'shell', value: 'powershell.exe', label: 'PowerShell' }

  // Build a single "default launch" key — either "shell:<path>" or "profile:<id>"
  const currentKey = dl.type === 'profile' ? `profile:${dl.value}` : `shell:${dl.value}`

  function pickLaunch(e) {
    const v = e.target.value
    if (v.startsWith('shell:')) {
      const path = v.slice(6)
      const preset = SHELL_PRESETS.find(p => p.value === path)
      set({ defaultLaunch: { type: 'shell', value: path, label: preset?.label || path } })
    } else if (v.startsWith('profile:')) {
      const id = Number(v.slice(8))
      const p = profiles.find(p => p.id === id)
      if (!p) return
      const args = []
      if (p.username) args.push(`${p.username}@${p.host}`)
      else            args.push(p.host)
      if (p.port && p.port !== 22) args.push('-p', String(p.port))
      if (p.identity_file) args.push('-i', p.identity_file)
      if (p.extra_args) args.push(...p.extra_args.split(/\s+/).filter(Boolean))
      set({ defaultLaunch: { type: 'profile', value: id, label: p.name, args } })
    }
  }

  async function toggleAutoStart(on) {
    const result = await window.nexterm.startup.set(on)
    setAutoStart(result)
    set({ launchOnStartup: result })
  }

  const preset = settings.launchSizePreset || 'medium'

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div>
          <div className="settings-label">Default Launch</div>
          <div className="settings-desc">What opens when you click <strong>+</strong> for a new tab</div>
        </div>
        <select className="settings-select" value={currentKey} onChange={pickLaunch}>
          <optgroup label="Shells">
            {SHELL_PRESETS.map(s => (
              <option key={s.value} value={`shell:${s.value}`}>{s.label}</option>
            ))}
          </optgroup>
          {profiles.length > 0 && (
            <optgroup label="SSH Profiles">
              {profiles.map(p => (
                <option key={p.id} value={`profile:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Launch on system startup</div>
          <div className="settings-desc">Open NexTerm automatically when Windows starts</div>
        </div>
        <Toggle checked={autoStart} onChange={toggleAutoStart} />
      </div>

      <div className="settings-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="settings-label">Window Size on Launch</div>
          <div className="settings-desc">Initial size of the NexTerm window</div>
        </div>
        <div className="style-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 280 }}>
          {SIZE_PRESETS.map(o => (
            <button
              key={o.v}
              className={`cursor-opt ${preset === o.v ? 'active' : ''}`}
              onClick={() => set({ launchSizePreset: o.v })}
              title={o.desc}
              style={{ flexDirection: 'column', height: 42, lineHeight: 1.2 }}
            >
              <div style={{ fontWeight: 600 }}>{o.l}</div>
              <div style={{ fontSize: 10, opacity: 0.65 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <>
          <div className="settings-row">
            <div className="settings-label">Width (px)</div>
            <input
              type="number" min={400} max={4000} step={50}
              className="settings-input"
              style={{ minWidth: 120 }}
              value={settings.launchWidth || 1280}
              onChange={e => set({ launchWidth: Number(e.target.value) })}
            />
          </div>
          <div className="settings-row">
            <div className="settings-label">Height (px)</div>
            <input
              type="number" min={300} max={3000} step={50}
              className="settings-input"
              style={{ minWidth: 120 }}
              value={settings.launchHeight || 800}
              onChange={e => set({ launchHeight: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      <div className="settings-desc" style={{ marginTop: 10, opacity: 0.55 }}>
        Window size and startup changes apply on the <strong>next launch</strong> of NexTerm.
      </div>
    </div>
  )
}

function LogoPicker({ logos, settings, set }) {
  const [customPreview, setCustomPreview] = useState([])
  const active = settings.bannerLogo || 'nexterm'

  // Live preview for the custom-text logo
  useEffect(() => {
    if (active !== 'custom') return
    window.nexterm.banner.renderCustom({
      text: settings.customLogoText || 'NX',
      subtitle: settings.customLogoSubtitle || ''
    }).then(setCustomPreview)
  }, [active, settings.customLogoText, settings.customLogoSubtitle])

  const STATIC = [
    { v: 'nexterm', l: 'NexTerm' },
    { v: 'windows', l: 'Windows 7' },
    { v: 'tux',     l: 'Tux' },
    { v: 'cat',     l: 'Cat' }
  ]

  return (
    <div className="logo-grid">
      {STATIC.map(o => (
        <div
          key={o.v}
          className={`logo-card ${active === o.v ? 'active' : ''}`}
          onClick={() => set({ bannerLogo: o.v })}
        >
          <div className="logo-preview">
            {logos[o.v] && logos[o.v].length > 0
              ? <AnsiText lines={logos[o.v]} />
              : <span className="logo-empty">— no logo —</span>}
          </div>
          <div className="logo-name">{o.l}</div>
        </div>
      ))}

      {/* Custom 2–4 letter text */}
      <div
        className={`logo-card ${active === 'custom' ? 'active' : ''}`}
        onClick={() => set({ bannerLogo: 'custom' })}
      >
        <div className="logo-preview">
          {customPreview.length > 0
            ? <AnsiText lines={customPreview} />
            : <span className="logo-empty">type text below</span>}
        </div>
        <div className="logo-name">Custom Text</div>
        <div className="logo-inputs" onClick={e => e.stopPropagation()}>
          <input
            className="settings-input"
            placeholder="Initials (e.g. RJ)"
            maxLength={4}
            value={settings.customLogoText || ''}
            onChange={e => set({ customLogoText: e.target.value, bannerLogo: 'custom' })}
          />
          <input
            className="settings-input"
            placeholder="Subtitle (optional)"
            maxLength={20}
            value={settings.customLogoSubtitle || ''}
            onChange={e => set({ customLogoSubtitle: e.target.value, bannerLogo: 'custom' })}
          />
        </div>
      </div>

      {/* None — last */}
      <div
        className={`logo-card ${active === 'none' ? 'active' : ''}`}
        onClick={() => set({ bannerLogo: 'none' })}
      >
        <div className="logo-preview">
          <span className="logo-empty">— no logo —</span>
        </div>
        <div className="logo-name">None</div>
      </div>
    </div>
  )
}

export default function Settings({ onClose }) {
  const { settings, updateSettings } = useStore()
  const [section, setSection] = useState('Appearance')
  const [logos, setLogos] = useState({})

  useEffect(() => {
    window.nexterm.banner.getLogos().then(setLogos)
  }, [])

  function set(patch) { updateSettings(patch) }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span>Settings</span>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: 20 }}>×</button>
      </div>

      <div className="settings-body">
        {/* Sidebar */}
        <div className="settings-sidebar">
          {SECTIONS.map(s => (
            <div
              key={s}
              className={`settings-nav-item ${section === s ? 'active' : ''}`}
              onClick={() => setSection(s)}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">

          {/* ── Appearance ── */}
          {section === 'Appearance' && (
            <div className="settings-group">
              <p className="section-title">Theme</p>
              <div className="theme-grid">
                {Object.entries(THEMES).map(([key, t]) => (
                  <div
                    key={key}
                    className={`theme-swatch ${settings.theme === key ? 'active' : ''}`}
                    onClick={() => set({ theme: key })}
                  >
                    <div className="swatch-preview" style={{ background: t.bg }}>
                      {Object.values(t.xterm).slice(5, 11).map((c, i) => (
                        <div key={i} className="swatch-dot" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="swatch-name" style={{ color: t.xterm.foreground, background: t.bg }}>
                      {t.name}
                    </div>
                  </div>
                ))}
              </div>

              <p className="section-title" style={{ marginTop: 18 }}>Custom Colors</p>
              <div className="settings-desc" style={{ marginBottom: 8 }}>
                Override individual colors from the theme. Empty = use theme value.
              </div>
              <CustomColors settings={settings} set={set} />
            </div>
          )}

          {/* ── Window ── */}
          {section === 'Window' && (
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="settings-label">Status Bar</div>
                  <div className="settings-desc">Bottom strip showing cwd, git branch, and clock</div>
                </div>
                <Toggle
                  checked={settings.showStatusBar !== false}
                  onChange={v => set({ showStatusBar: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Command Timer</div>
                  <div className="settings-desc">Show <code>[1.2s]</code> next to the previous command in PowerShell prompts</div>
                </div>
                <Toggle
                  checked={settings.commandTimer !== false}
                  onChange={v => set({ commandTimer: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Mini-map Gutter</div>
                  <div className="settings-desc">Right-edge minimap of scrollback. Click to jump; lines that look like errors are marked red.</div>
                </div>
                <Toggle
                  checked={settings.miniMap === true}
                  onChange={v => set({ miniMap: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Hide tab bar in Coder mode</div>
                  <div className="settings-desc">When editing a project, hide the top tab bar so the editor uses the full width. The bottom-sheet terminal inside the editor (Ctrl+`) handles quick shell tasks.</div>
                </div>
                <Toggle
                  checked={settings.hideTabsInCoder !== false}
                  onChange={v => set({ hideTabsInCoder: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Animated Banner</div>
                  <div className="settings-desc">Type-in banner with a neon glow on every new tab</div>
                </div>
                <Toggle
                  checked={settings.animatedBanner === true}
                  onChange={v => set({ animatedBanner: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Inline Images (Sixel + iTerm2)</div>
                  <div className="settings-desc">Renders images written via Sixel or iTerm2 image protocol</div>
                </div>
                <Toggle
                  checked={settings.inlineImages !== false}
                  onChange={v => set({ inlineImages: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Link Hover Cards</div>
                  <div className="settings-desc">Hover any URL in the terminal to see its host + page title</div>
                </div>
                <Toggle
                  checked={settings.linkHoverCards !== false}
                  onChange={v => set({ linkHoverCards: v })}
                />
              </div>

              <QuakeModeRow settings={settings} set={set} />
              <ExplorerCtxRow settings={settings} set={set} />

              <div className="settings-row">
                <div>
                  <div className="settings-label">Window Controls Position</div>
                  <div className="settings-desc">Where minimize / maximize / close go</div>
                </div>
                <div className="cursor-opts">
                  {['right', 'left'].map(p => (
                    <button
                      key={p}
                      className={`cursor-opt ${settings.windowButtons === p ? 'active' : ''}`}
                      onClick={() => set({ windowButtons: p })}
                    >
                      {p === 'right' ? 'Right (Windows)' : 'Left (macOS)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">App Icons Style</div>
                  <div className="settings-desc">Top-right ⚡⏱⌘⚙ icons appearance</div>
                </div>
                <div className="cursor-opts">
                  {[
                    { v: '3d',      l: '3D' },
                    { v: 'flat',    l: 'Flat' },
                    { v: 'outline', l: 'Outline' },
                    { v: 'unicode', l: 'Emoji' }
                  ].map(o => (
                    <button
                      key={o.v}
                      className={`cursor-opt ${(settings.appIconsStyle || '3d') === o.v ? 'active' : ''}`}
                      onClick={() => set({ appIconsStyle: o.v })}
                    >{o.l}</button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">App Icons Position</div>
                  <div className="settings-desc">Where the four icons sit in the title bar</div>
                </div>
                <div className="cursor-opts">
                  {['right', 'center'].map(p => (
                    <button
                      key={p}
                      className={`cursor-opt ${(settings.appIconsPosition || 'right') === p ? 'active' : ''}`}
                      onClick={() => set({ appIconsPosition: p })}
                    >
                      {p === 'right' ? 'Right' : 'Center'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="settings-label">Button Style</div>
                  <div className="settings-desc">Visual style for the window controls</div>
                </div>
                <div className="style-grid">
                  {[
                    { v: 'windows',  l: 'Windows' },
                    { v: 'mac',      l: 'macOS' },
                    { v: 'macIcons', l: 'macOS+' },
                    { v: 'minimal',  l: 'Minimal' },
                    { v: 'pill',     l: 'Pill' },
                    { v: 'glass',    l: 'Glass' },
                    { v: 'neon',     l: 'Neon' },
                    { v: 'retro',    l: 'Retro' },
                    { v: 'compact',  l: 'Compact' },
                    { v: 'flat',     l: 'Flat' },
                    { v: 'outline',  l: 'Outline' },
                    { v: 'chrome',   l: 'Chrome' }
                  ].map(o => (
                    <button
                      key={o.v}
                      className={`cursor-opt ${settings.buttonStyle === o.v ? 'active' : ''}`}
                      onClick={() => set({ buttonStyle: o.v })}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-label">Preview</div>
                <ButtonStylePreview style={settings.buttonStyle || 'windows'} />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Window Opacity</div>
                  <div className="settings-desc">
                    Make the entire window translucent. Live: <kbd>Ctrl+Shift+Scroll</kbd>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="range" min={0.3} max={1.0} step={0.01}
                    className="settings-range"
                    value={settings.terminalOpacity ?? 1.0}
                    onChange={e => {
                      const v = Number(e.target.value)
                      set({ terminalOpacity: v })
                      window.nexterm.win.setOpacity(v)
                    }}
                  />
                  <span style={{ fontSize: 13, minWidth: 38 }}>
                    {Math.round((settings.terminalOpacity ?? 1.0) * 100)}%
                  </span>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Background Blur</div>
                  <div className="settings-desc">
                    Native Windows 11 blur behind the window.<br/>
                    <span style={{ opacity: 0.7 }}>
                      ⓘ Enabling blur (or image / opacity &lt; 100%) disables Windows' smooth
                      maximize animation. Restart NexTerm to apply window-mode changes.
                    </span>
                  </div>
                </div>
                <div className="cursor-opts">
                  {[
                    { v: 'none',    l: 'Off' },
                    { v: 'mica',    l: 'Mica' },
                    { v: 'acrylic', l: 'Acrylic' },
                    { v: 'tabbed',  l: 'Tabbed' }
                  ].map(o => (
                    <button
                      key={o.v}
                      className={`cursor-opt ${(settings.windowBlur || 'none') === o.v ? 'active' : ''}`}
                      onClick={async () => {
                        set({ windowBlur: o.v })
                        await window.nexterm.win.setBlur(o.v)
                      }}
                    >{o.l}</button>
                  ))}
                </div>
              </div>

              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="settings-label">Background Image</div>
                  <div className="settings-desc">Show an image behind the terminal</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <label className="btn-primary" style={{ cursor: 'pointer', fontSize: 11, padding: '5px 12px' }}>
                    {settings.backgroundImage ? 'Change…' : 'Choose file…'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                      style={{ display: 'none' }}
                      onChange={async e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const reader = new FileReader()
                        reader.onload = () => set({ backgroundImage: reader.result })
                        reader.readAsDataURL(f)
                      }}
                    />
                  </label>
                  {settings.backgroundImage && (
                    <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => set({ backgroundImage: null })}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {settings.backgroundImage && (
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Image Dimming</div>
                    <div className="settings-desc">
                      Darken the background overlay (0% = full image, 70% = mostly dark)
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range" min={0} max={0.99} step={0.01}
                      className="settings-range"
                      value={settings.backgroundImageDim ?? 0.45}
                      onChange={e => set({ backgroundImageDim: Number(e.target.value) })}
                    />
                    <span style={{ fontSize: 13, minWidth: 38 }}>
                      {Math.round((settings.backgroundImageDim ?? 0.45) * 100)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="settings-row">
                <div>
                  <div className="settings-label">Always on Top</div>
                  <div className="settings-desc">Keep NexTerm above all other windows</div>
                </div>
                <Toggle
                  checked={settings.alwaysOnTop === true}
                  onChange={async (v) => {
                    set({ alwaysOnTop: v })
                    await window.nexterm.win.setAlwaysOnTop(v)
                  }}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Run in Background</div>
                  <div className="settings-desc">Closing the window hides it instead of quitting</div>
                </div>
                <Toggle
                  checked={settings.runInBackground === true}
                  onChange={(v) => set({ runInBackground: v })}
                />
              </div>

            </div>
          )}

          {/* ── Startup ── */}
          {section === 'Startup' && <StartupSection settings={settings} set={set} />}

          {/* ── Font ── */}
          {section === 'Font' && (
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="settings-label">Font Family</div>
                </div>
                <select
                  className="settings-select"
                  value={settings.fontFamily?.split(',')[0].trim()}
                  onChange={e => set({ fontFamily: `${e.target.value}, monospace` })}
                >
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Font Size</div>
                  <div className="settings-desc">Current: {settings.fontSize}px</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="range" min={8} max={32} step={1}
                    className="settings-range"
                    value={settings.fontSize}
                    onChange={e => set({ fontSize: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 13, minWidth: 28 }}>{settings.fontSize}</span>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Line Height</div>
                  <div className="settings-desc">Current: {settings.lineHeight}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="range" min={1.0} max={2.0} step={0.05}
                    className="settings-range"
                    value={settings.lineHeight}
                    onChange={e => set({ lineHeight: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 13, minWidth: 28 }}>{settings.lineHeight}</span>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-label">Cursor Style</div>
                <div className="cursor-opts">
                  {['block', 'underline', 'bar'].map(s => (
                    <button
                      key={s}
                      className={`cursor-opt ${settings.cursorStyle === s ? 'active' : ''}`}
                      onClick={() => set({ cursorStyle: s })}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-label">Cursor Blink</div>
                <Toggle
                  checked={settings.cursorBlink !== false}
                  onChange={v => set({ cursorBlink: v })}
                />
              </div>

              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <div className="settings-label">Preview</div>
                <FontPreview settings={settings} />
              </div>
            </div>
          )}

          {/* ── Terminal ── */}
          {section === 'Terminal' && (
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="settings-label">Command suggestions</div>
                  <div className="settings-desc">As you type, NexTerm suggests the rest of the command from your history + a curated list. Press <kbd>Tab</kbd> to accept. No AI, no RAM, no quota.</div>
                </div>
                <Toggle
                  checked={settings.suggestions !== false}
                  onChange={v => set({ suggestions: v })}
                />
              </div>

              <PopularCommandsEditor settings={settings} set={set} />

              <div className="settings-row">
                <div>
                  <div className="settings-label">Scrollback</div>
                  <div className="settings-desc">Lines of output kept in memory per pane</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" min={100} max={10000000} step={100}
                    className="settings-input"
                    style={{ minWidth: 110 }}
                    value={settings.scrollback}
                    onChange={e => set({ scrollback: Number(e.target.value) })}
                  />
                  <button
                    className="cursor-opt"
                    onClick={() => set({ scrollback: 10000000 })}
                    title="~10 million lines"
                    style={{ fontSize: 11 }}
                  >
                    Unlimited
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Restore session on launch</div>
                  <div className="settings-desc">Reopen tabs / panes from your last NexTerm session</div>
                </div>
                <Toggle
                  checked={settings.restoreSession !== false}
                  onChange={(v) => set({ restoreSession: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Welcome Banner</div>
                  <div className="settings-desc">Show system info + ASCII logo on every new shell</div>
                </div>
                <Toggle
                  checked={settings.showBanner !== false}
                  onChange={v => set({ showBanner: v })}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Search Web URL</div>
                  <div className="settings-desc">Used by the right-click "Search web for…" action</div>
                </div>
                <input
                  className="settings-input"
                  placeholder="https://www.google.com/search?q="
                  value={settings.searchUrl || ''}
                  onChange={e => set({ searchUrl: e.target.value })}
                />
              </div>

              <div className="settings-subcard">
                <p className="settings-subcard-title">⚠ Warnings</p>

                <div className="settings-row">
                  <div>
                    <div className="settings-label">Warn when closing multiple tabs</div>
                    <div className="settings-desc">Confirm before closing the window if 2+ tabs are open</div>
                  </div>
                  <Toggle
                    checked={settings.warnMultiTab !== false}
                    onChange={v => set({ warnMultiTab: v })}
                  />
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-label">Warn when pasting large text</div>
                    <div className="settings-desc">
                      Confirm before pasting more than {Math.round((settings.pasteWarnLimit ?? 5120)/1024)} KiB
                    </div>
                  </div>
                  <Toggle
                    checked={settings.warnPasteSize !== false}
                    onChange={v => set({ warnPasteSize: v })}
                  />
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-label">Paste Warning Threshold</div>
                    <div className="settings-desc">Bytes — paste larger than this triggers a confirm dialog</div>
                  </div>
                  <input
                    type="number" min={256} max={1048576} step={256}
                    className="settings-input"
                    style={{ minWidth: 120 }}
                    disabled={settings.warnPasteSize === false}
                    value={settings.pasteWarnLimit ?? 5120}
                    onChange={e => set({ pasteWarnLimit: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div className="settings-label">Logo Art</div>
                <div className="settings-desc">
                  Choose the ASCII art shown next to the banner. Open a new tab to apply.
                </div>
                <LogoPicker logos={logos} settings={settings} set={set} />
              </div>

              <BannerWidgetsRows settings={settings} set={set} />
            </div>
          )}

          {/* ── Shell ── */}
          {section === 'Shell' && (
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-label">Default Shell</div>
                <select
                  className="settings-select"
                  value={settings.defaultShell}
                  onChange={e => set({ defaultShell: e.target.value })}
                >
                  {SHELLS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Custom Shell Path</div>
                  <div className="settings-desc">Override with any executable path</div>
                </div>
                <input
                  className="settings-input"
                  placeholder="e.g. C:\tools\fish.exe"
                  value={settings.customShell || ''}
                  onChange={e => set({ customShell: e.target.value })}
                />
              </div>
              <WslDistrosRow />

              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="settings-label">PowerShell Prompt Style</div>
                  <div className="settings-desc">
                    How your prompt is rendered. Open a new tab to apply.
                  </div>
                </div>
                <div className="cursor-opts">
                  {[
                    { v: 'powerline', l: 'Powerline' },
                    { v: 'pills',     l: 'Pills'     },
                    { v: 'minimal',   l: 'Minimal'   },
                    { v: 'classic',   l: 'Classic'   }
                  ].map(o => (
                    <button
                      key={o.v}
                      className={`cursor-opt ${(settings.promptStyle || 'powerline') === o.v ? 'active' : ''}`}
                      onClick={() => set({ promptStyle: o.v })}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── History ── */}
          {section === 'History' && (
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-label">Save History</div>
                <Toggle
                  checked={settings.saveHistory !== false}
                  onChange={v => set({ saveHistory: v })}
                />
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Max History Items</div>
                  <div className="settings-desc">Oldest entries removed when exceeded</div>
                </div>
                <input
                  type="number" min={100} max={100000}
                  className="settings-input"
                  style={{ minWidth: 100 }}
                  value={settings.maxHistoryItems}
                  onChange={e => set({ maxHistoryItems: Number(e.target.value) })}
                />
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">Clear History</div>
                  <div className="settings-desc">Permanently deletes all saved commands</div>
                </div>
                <button className="btn-danger" onClick={() => window.nexterm.history.clear()}>
                  Clear All History
                </button>
              </div>
            </div>
          )}

          {/* ── Aliases ── */}
          {section === 'Aliases' && <AliasesSection settings={settings} set={set} />}

          {/* ── Bookmarks ── */}
          {section === 'Bookmarks' && <BookmarksSection settings={settings} set={set} />}

          {/* ── AI ── */}
          {section === 'AI' && <AiSection settings={settings} set={set} />}
          {section === 'Coder' && <CoderSection settings={settings} set={set} />}

          {/* ── Snippets ── */}
          {section === 'Snippets' && <SnippetsSection settings={settings} set={set} />}

          {/* ── Workspaces ── */}
          {section === 'Workspaces' && <WorkspacesSection settings={settings} />}

          {/* ── Notifications ── */}
          {section === 'Notifications' && <NotificationsSection settings={settings} set={set} />}

          {/* ── Vault ── */}
          {section === 'Vault' && <VaultSection settings={settings} set={set} />}

          {/* ── Shortcuts ── */}
          {section === 'Shortcuts' && <ShortcutsSection settings={settings} set={set} />}

          {/* ── Config ── */}
          {section === 'Config' && <ConfigSection settings={settings} setSettings={useStore.getState().setSettings} />}

        </div>
      </div>
    </div>
  )
}

function WslDistrosRow() {
  const [state, setState] = useState({ available: true, distros: [], loading: true })
  const [installing, setInstalling] = useState('')

  async function refresh() {
    setState(s => ({ ...s, loading: true }))
    const r = await window.nexterm.wsl.list()
    setState({ ...r, loading: false })
  }
  useEffect(() => { refresh() }, [])

  async function install(distro) {
    setInstalling(distro)
    // No paneId here — main will spawn a detached install pty? We don't have a
    // pane to attach to. Instead just open external docs OR spawn elevated.
    // Simpler UX: tell the user to run it from a terminal tab.
    await window.nexterm.info({
      message: `To install ${distro}`,
      detail: `Open a new terminal tab and run:\n\n    wsl --install -d ${distro}\n\nA Windows restart is usually required afterwards.`
    })
    setInstalling('')
    refresh()
  }

  return (
    <div className="settings-row" style={{ alignItems: 'flex-start' }}>
      <div>
        <div className="settings-label">WSL Distributions</div>
        <div className="settings-desc">
          {state.loading ? 'Detecting…'
            : !state.available ? 'wsl.exe not found on PATH'
            : state.distros.length === 0 ? 'No distros installed yet'
            : `Installed: ${state.distros.join(', ')}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={refresh} disabled={state.loading}>Refresh</button>
        {state.available && state.distros.length === 0 && (
          <>
            <button className="btn-primary"   onClick={() => install('Ubuntu')} disabled={!!installing}>Install Ubuntu</button>
            <button className="btn-secondary" onClick={() => install('Debian')} disabled={!!installing}>Install Debian</button>
          </>
        )}
      </div>
    </div>
  )
}

function WorkspacesSection({ settings }) {
  const [name, setName] = useState('')
  const ws = settings.workspaces || {}
  const names = Object.keys(ws)
  const { saveWorkspace, deleteWorkspace, loadWorkspace } = useStore.getState()

  async function load(n) {
    const ok = await window.nexterm.confirm({
      message: `Load workspace "${n}"?`,
      detail: 'This will replace your current tabs. Unsaved tabs will be closed.'
    })
    if (ok) loadWorkspace(n)
  }
  async function del(n) {
    const ok = await window.nexterm.confirm({
      message: `Delete workspace "${n}"?`, danger: true
    })
    if (ok) deleteWorkspace(n)
  }

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div>
          <div className="settings-label">Save current tabs as workspace</div>
          <div className="settings-desc">All open tabs (names, panes, last cwd) get bundled under a name you can reload later.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="settings-input"
            placeholder="Workspace name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() => { saveWorkspace(name.trim()); setName('') }}
          >
            Save
          </button>
        </div>
      </div>

      {names.length === 0 ? (
        <div className="settings-desc" style={{ padding: 12, opacity: 0.6 }}>
          No saved workspaces yet.
        </div>
      ) : (
        <div className="settings-subcard">
          {names.map(n => (
            <div key={n} className="settings-row">
              <div>
                <div className="settings-label">{n}</div>
                <div className="settings-desc">{ws[n].tabs?.length ?? 0} tab(s)</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary"   onClick={() => load(n)}>Load</button>
                <button className="btn-danger"    onClick={() => del(n)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationsSection({ settings, set }) {
  return (
    <div className="settings-group">
      <div className="settings-row">
        <div>
          <div className="settings-label">Notify when long commands finish</div>
          <div className="settings-desc">System notification fires when a command takes longer than the threshold AND the window is not focused.</div>
        </div>
        <Toggle
          checked={settings.notifyLongCommands !== false}
          onChange={v => set({ notifyLongCommands: v })}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Threshold (seconds)</div>
          <div className="settings-desc">Commands shorter than this stay silent</div>
        </div>
        <input
          type="number" min={5} max={3600}
          className="settings-input"
          style={{ minWidth: 100 }}
          disabled={settings.notifyLongCommands === false}
          value={Math.round((settings.notifyThresholdMs ?? 30000) / 1000)}
          onChange={e => set({ notifyThresholdMs: Math.max(5, Number(e.target.value) || 30) * 1000 })}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Play notification sound</div>
          <div className="settings-desc">Use the OS default notification sound</div>
        </div>
        <Toggle
          checked={settings.notifySound !== false}
          onChange={v => set({ notifySound: v })}
        />
      </div>
    </div>
  )
}

function QuakeModeRow({ settings, set }) {
  const [hotkey, setHotkey] = useState(settings.quakeHotkey || 'Ctrl+Shift+Q')

  async function applyQuake(patch) {
    const next = { ...settings, ...patch }
    set(patch)
    try {
      await window.nexterm.quake.apply({
        enabled: !!next.quakeMode,
        hotkey:  next.quakeHotkey || 'Ctrl+Shift+Q',
        heightPct: next.quakeHeight ?? 50
      })
    } catch {}
  }

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-label">Quake Mode</div>
          <div className="settings-desc">Press the global hotkey anywhere to slide NexTerm down from the top of your screen.</div>
        </div>
        <Toggle
          checked={settings.quakeMode === true}
          onChange={v => applyQuake({ quakeMode: v })}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Quake Hotkey</div>
          <div className="settings-desc">Examples: Ctrl+Shift+Q, F12, Alt+Space</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="settings-input"
            value={hotkey}
            onChange={e => setHotkey(e.target.value)}
            disabled={!settings.quakeMode}
            style={{ minWidth: 150 }}
          />
          <button
            className="btn-secondary"
            disabled={!settings.quakeMode}
            onClick={() => applyQuake({ quakeHotkey: hotkey.trim() })}
          >
            Apply
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Quake Height</div>
          <div className="settings-desc">Percent of screen height when slid down</div>
        </div>
        <input
          type="number" min={20} max={100}
          className="settings-input"
          style={{ minWidth: 90 }}
          disabled={!settings.quakeMode}
          value={settings.quakeHeight ?? 50}
          onChange={e => applyQuake({ quakeHeight: Math.min(100, Math.max(20, Number(e.target.value) || 50)) })}
        />
      </div>
    </>
  )
}

function ExplorerCtxRow({ settings, set }) {
  const [busy, setBusy] = useState(false)

  async function toggle(v) {
    setBusy(true)
    try {
      const r = v
        ? await window.nexterm.explorer.install()
        : await window.nexterm.explorer.uninstall()
      if (r?.ok) set({ explorerContextMenu: v })
      else await window.nexterm.info({ message: 'Failed to update Explorer context menu', detail: r?.error || '' })
    } finally { setBusy(false) }
  }

  return (
    <div className="settings-row">
      <div>
        <div className="settings-label">"Open in NexTerm" Explorer Menu</div>
        <div className="settings-desc">Right-click any folder in Windows Explorer and launch NexTerm in that folder. Per-user only — no admin needed.</div>
      </div>
      <Toggle
        checked={settings.explorerContextMenu === true}
        onChange={v => { if (!busy) toggle(v) }}
      />
    </div>
  )
}

function SnippetsSection({ settings, set }) {
  const list = settings.snippets || []
  const [draft, setDraft] = useState({ name: '', command: '', description: '' })

  function add() {
    if (!draft.name.trim() || !draft.command.trim()) return
    const next = [...list, { id: `s-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, ...draft }]
    set({ snippets: next })
    setDraft({ name: '', command: '', description: '' })
  }
  function remove(id) {
    set({ snippets: list.filter(s => s.id !== id) })
  }

  return (
    <div className="settings-group">
      <div className="settings-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="settings-label">New snippet</div>
          <div className="settings-desc">
            Use <code>{'${name}'}</code> or <code>{'${name:default}'}</code> for placeholders. Open with <strong>Ctrl+Shift+I</strong>.
          </div>
        </div>
      </div>
      <div className="settings-subcard">
        <div className="form-row">
          <label>Name</label>
          <input className="settings-input" placeholder="Tail nginx log"
            value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>Command</label>
          <input className="settings-input" placeholder="ssh ${user:root}@${host} 'tail -f /var/log/nginx/access.log'"
            value={draft.command} onChange={e => setDraft(d => ({ ...d, command: e.target.value }))} />
        </div>
        <div className="form-row">
          <label>Description</label>
          <input className="settings-input" placeholder="(optional)"
            value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
        </div>
        <div className="form-actions">
          <button className="btn-primary" onClick={add} disabled={!draft.name.trim() || !draft.command.trim()}>Add Snippet</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="settings-desc" style={{ padding: 12, opacity: 0.6 }}>No snippets yet.</div>
      ) : (
        <div className="settings-subcard">
          {list.map(s => (
            <div key={s.id} className="settings-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="settings-label">{s.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.command}</div>
                {s.description && <div className="settings-desc">{s.description}</div>}
              </div>
              <button className="btn-danger" onClick={() => remove(s.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BannerWidgetsRows({ settings, set }) {
  const w = settings.widgets || {}
  function upd(patch) { set({ widgets: { ...w, ...patch } }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
      <div className="settings-label">Banner Extras</div>
      <div className="settings-desc" style={{ marginBottom: 6 }}>
        Tiny extras shown in the welcome banner of every new shell. Data refreshed every 5 min.
      </div>

      <div className="settings-subcard">
        <div className="settings-row">
          <div>
            <div className="settings-label">Inline weather</div>
            <div className="settings-desc">Tiny ⛅ 23°C City next to your user@host (open-meteo.com, no key)</div>
          </div>
          <Toggle checked={w.weather !== false} onChange={v => upd({ weather: v })} />
        </div>
      </div>
    </div>
  )
}

const CLOUD_PROVIDERS = [
  { id: 'groq',       label: 'Groq (free, ~30 req/min, very fast)',  defaultModel: 'llama-3.3-70b-versatile',           keyUrl: 'https://console.groq.com/keys' },
  { id: 'gemini',     label: 'Google Gemini (free, 1500/day)',       defaultModel: 'gemini-2.0-flash',                  keyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'cerebras',   label: 'Cerebras (free, ultra-fast)',           defaultModel: 'llama3.1-8b',                       keyUrl: 'https://cloud.cerebras.ai' },
  { id: 'openrouter', label: 'OpenRouter (gateway, free models)',     defaultModel: 'meta-llama/llama-3.2-3b-instruct:free', keyUrl: 'https://openrouter.ai/keys' }
]

// Repair a saved model that obviously doesn't belong to the current provider.
// Catches users with stale settings from previous defaults.
function resolveCloudModel(provider, savedModel) {
  const def = CLOUD_PROVIDERS.find(p => p.id === provider)?.defaultModel
  if (!savedModel) return def
  const m = savedModel.toLowerCase()
  if (provider === 'gemini'     && !m.startsWith('gemini'))                         return def
  if (provider === 'cerebras'   && (m.includes('versatile') || m.includes('/') || m.startsWith('gemini'))) return def
  if (provider === 'groq'       && (m.startsWith('gemini') || m.includes('/')))    return def
  if (provider === 'openrouter' && !m.includes('/'))                                return def
  return savedModel
}

function CliInstaller() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  async function install() {
    setBusy(true); setResult(null)
    const r = await window.nexterm.project.installCli()
    setBusy(false)
    setResult(r)
  }
  return (
    <div className="settings-subcard">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="btn-primary" onClick={install} disabled={busy}>
          {busy ? 'Installing…' : 'Install nexterm launcher'}
        </button>
        {result?.ok && (
          <span style={{ color: '#22c55e', fontSize: 11 }}>
            ✓ Installed at <code>{result.path}</code> — open a new shell and try <code>nexterm .</code>
          </span>
        )}
        {result && !result.ok && (
          <span style={{ color: '#ef4444', fontSize: 11 }}>⚠ {result.error}</span>
        )}
      </div>
    </div>
  )
}

function PopularCommandsEditor({ settings, set }) {
  const list = settings.popularCommands || []
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v) return
    if (list.includes(v)) return
    set({ popularCommands: [v, ...list].slice(0, 200) })
    setDraft('')
  }
  function removeAt(i) {
    const next = list.filter((_, idx) => idx !== i)
    set({ popularCommands: next })
  }
  return (
    <div className="settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
      <div>
        <div className="settings-label">Your custom commands</div>
        <div className="settings-desc">Added on top of NexTerm's built-in popular list (git, npm, docker, PowerShell etc.). Your entries take priority. Press Enter to add.</div>
      </div>
      <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 8 }}>
        <input
          className="settings-input"
          placeholder="e.g. ssh me@server -L 5000:localhost:5000"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={add} disabled={!draft.trim()}>＋ Add</button>
      </div>
      {list.length > 0 && (
        <div style={{ width: '100%', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((cmd, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 11 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd}</span>
              <button className="btn-secondary" onClick={() => removeAt(i)} style={{ padding: '2px 8px', fontSize: 11 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SnippetsEditor({ coder, upd }) {
  const snippets = coder.snippets || {}
  const [selected, setSelected] = useState(() => Object.keys(snippets)[0] || 'javascript')
  const [newLang, setNewLang] = useState('')

  const list = snippets[selected] || []

  function updSnippets(updater) {
    const next = updater(snippets)
    upd({ snippets: next })
  }

  function addLanguage() {
    const lang = newLang.trim()
    if (!lang) return
    updSnippets(s => ({ ...s, [lang]: s[lang] || [] }))
    setSelected(lang)
    setNewLang('')
  }
  function removeLanguage() {
    if (!confirm(`Remove all snippets for "${selected}"?`)) return
    updSnippets(s => {
      const { [selected]: _, ...rest } = s
      return rest
    })
    setSelected(Object.keys(snippets).find(k => k !== selected) || 'javascript')
  }
  function addSnippet() {
    updSnippets(s => ({
      ...s,
      [selected]: [...(s[selected] || []), { prefix: '', body: '', description: '' }]
    }))
  }
  function updateSnippet(i, patch) {
    updSnippets(s => ({
      ...s,
      [selected]: (s[selected] || []).map((sn, idx) => idx === i ? { ...sn, ...patch } : sn)
    }))
  }
  function removeSnippet(i) {
    updSnippets(s => ({
      ...s,
      [selected]: (s[selected] || []).filter((_, idx) => idx !== i)
    }))
  }

  return (
    <div className="settings-subcard">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <select
          className="settings-select"
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ flex: 1 }}
        >
          {Object.keys(snippets).length === 0 && <option value={selected}>{selected} (no snippets yet)</option>}
          {Object.keys(snippets).map(k => (
            <option key={k} value={k}>{k} ({snippets[k]?.length || 0})</option>
          ))}
        </select>
        <input
          className="settings-input"
          placeholder="add language (e.g. dart)"
          value={newLang}
          onChange={e => setNewLang(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addLanguage() }}
          style={{ width: 180 }}
        />
        <button className="btn-secondary" onClick={addLanguage}>+ Lang</button>
        {snippets[selected] && (
          <button className="btn-secondary" onClick={removeLanguage} title="Remove this language">−</button>
        )}
      </div>

      {list.length === 0 && (
        <div className="settings-desc" style={{ opacity: 0.5, padding: '8px 0' }}>
          No snippets for <code>{selected}</code>. Click + Snippet to add one.
        </div>
      )}

      {list.map((s, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="settings-input"
              placeholder="prefix (e.g. fn)"
              value={s.prefix}
              onChange={e => updateSnippet(i, { prefix: e.target.value })}
              style={{ flex: '0 0 120px' }}
            />
            <input
              className="settings-input"
              placeholder="description"
              value={s.description || ''}
              onChange={e => updateSnippet(i, { description: e.target.value })}
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={() => removeSnippet(i)} title="Delete">×</button>
          </div>
          <textarea
            className="settings-input"
            placeholder={"body (Monaco syntax: $1, ${1:default}, $0)"}
            value={s.body}
            onChange={e => updateSnippet(i, { body: e.target.value })}
            rows={3}
            style={{ fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 12, resize: 'vertical' }}
          />
        </div>
      ))}

      <button className="btn-primary" onClick={addSnippet}>+ Snippet</button>
    </div>
  )
}

function CoderSection({ settings, set }) {
  const coder = settings.coder || {}
  function upd(patch) { set({ coder: { ...coder, ...patch } }) }
  return (
    <div className="settings-section">
      <p className="section-title">Coder / Editor</p>
      <div className="settings-desc" style={{ marginBottom: 14 }}>
        Settings for the project editor (Monaco). Open Project lives in <strong>File menu → Open Project…</strong> when an editor tab is active.
      </div>

      <div className="settings-subcard">
        <div className="settings-row">
          <div>
            <div className="settings-label">Open project in new window</div>
            <div className="settings-desc">When you pick a project, open it in a brand-new NexTerm window. Leaves your current terminal tabs untouched. Turn this off to open projects as a tab in the current window.</div>
          </div>
          <Toggle
            checked={coder.openInNewWindow !== false}
            onChange={v => upd({ openInNewWindow: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Restore last open project(s) on startup</div>
            <div className="settings-desc">When NexTerm launches, automatically reopen the projects you had open last session as editor tabs. Each project keeps its own chat history.</div>
          </div>
          <Toggle
            checked={coder.restoreLastProject === true}
            onChange={v => upd({ restoreLastProject: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Hide tab bar in Coder mode</div>
            <div className="settings-desc">Maximize editor vertical space by hiding the top tab bar when editing a project. The bottom-sheet terminal (Ctrl+`) handles quick shell tasks. Mirrors the View menu toggle.</div>
          </div>
          <Toggle
            checked={settings.hideTabsInCoder !== false}
            onChange={v => set({ hideTabsInCoder: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Auto-save</div>
            <div className="settings-desc">Save edited files automatically after a short idle pause. No more Ctrl+S.</div>
          </div>
          <Toggle
            checked={coder.autoSave === true}
            onChange={v => upd({ autoSave: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Auto-save delay</div>
            <div className="settings-desc">Wait this long (ms) after the last keystroke before auto-saving. Only applies when auto-save is on.</div>
          </div>
          <input
            type="number" min={200} max={10000} step={100}
            className="settings-input" style={{ width: 100 }}
            value={coder.autoSaveDelayMs ?? 1500}
            onChange={e => upd({ autoSaveDelayMs: Math.max(200, Math.min(10000, Number(e.target.value) || 1500)) })}
            disabled={coder.autoSave !== true}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Confirm before closing unsaved file</div>
            <div className="settings-desc">When you close a tab with unsaved changes, ask first. Off = silent discard.</div>
          </div>
          <Toggle
            checked={coder.confirmOnClose !== false}
            onChange={v => upd({ confirmOnClose: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Format on save</div>
            <div className="settings-desc">Run Monaco's per-language formatter every time you save. JSON, JS/TS, HTML, CSS work out of the box.</div>
          </div>
          <Toggle
            checked={coder.formatOnSave === true}
            onChange={v => upd({ formatOnSave: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Trim trailing whitespace on save</div>
            <div className="settings-desc">Strip extra spaces/tabs at the end of each line.</div>
          </div>
          <Toggle
            checked={coder.trimTrailingWhitespace === true}
            onChange={v => upd({ trimTrailingWhitespace: v })}
          />
        </div>
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>Editor</p>
      <div className="settings-subcard">
        <div className="settings-row">
          <div>
            <div className="settings-label">Code font size</div>
            <div className="settings-desc">Font size in pixels for the Monaco code editor only.</div>
          </div>
          <input
            type="number" min={8} max={32} step={1}
            className="settings-input" style={{ width: 80 }}
            value={coder.fontSize ?? 13}
            onChange={e => upd({ fontSize: Math.max(8, Math.min(32, Number(e.target.value) || 13)) })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Sidebar / tabs font size</div>
            <div className="settings-desc">Font size for the file tree and open-file tabs. Set independently from the code font so you can have small UI chrome with a large code area, or vice versa.</div>
          </div>
          <input
            type="number" min={8} max={24} step={1}
            className="settings-input" style={{ width: 80 }}
            value={coder.treeFontSize ?? 12}
            onChange={e => upd({ treeFontSize: Math.max(8, Math.min(24, Number(e.target.value) || 12)) })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Tab size</div>
            <div className="settings-desc">Width of an indentation level, in spaces or tab columns.</div>
          </div>
          <input
            type="number" min={1} max={8} step={1}
            className="settings-input" style={{ width: 80 }}
            value={coder.tabSize ?? 2}
            onChange={e => upd({ tabSize: Math.max(1, Math.min(8, Number(e.target.value) || 2)) })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Insert spaces (instead of tabs)</div>
            <div className="settings-desc">When you press Tab, insert spaces. Off = real tab characters.</div>
          </div>
          <Toggle
            checked={coder.insertSpaces !== false}
            onChange={v => upd({ insertSpaces: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Word wrap</div>
            <div className="settings-desc">Wrap long lines at the editor width. Off = horizontal scroll.</div>
          </div>
          <Toggle
            checked={coder.wordWrap === true}
            onChange={v => upd({ wordWrap: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Show minimap</div>
            <div className="settings-desc">Right-side miniature of the whole file. Click to jump.</div>
          </div>
          <Toggle
            checked={coder.showMinimap !== false}
            onChange={v => upd({ showMinimap: v })}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Line numbers</div>
            <div className="settings-desc">Show line numbers in the left gutter.</div>
          </div>
          <Toggle
            checked={coder.lineNumbers !== false}
            onChange={v => upd({ lineNumbers: v })}
          />
        </div>
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>Command-line launcher</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Install a small <code>nexterm</code> script on your PATH so you can run <code>nexterm .</code> or <code>nexterm path\to\project</code> from any shell to open a project in NexTerm.
      </div>
      <CliInstaller />

      <p className="section-title" style={{ marginTop: 18 }}>Snippets</p>
      <div className="settings-desc" style={{ marginBottom: 8 }}>
        Custom code snippets that appear in the Monaco autocomplete. Use Monaco's snippet syntax for placeholders — <code>$1</code>, <code>${'{1:default}'}</code>, etc.
        Language key is a Monaco language id (e.g. <code>javascript</code>, <code>python</code>, <code>dart</code>) or <code>*</code> for all languages.
      </div>
      <SnippetsEditor coder={coder} upd={upd} />

      <p className="section-title" style={{ marginTop: 18 }}>Bottom Terminal</p>
      <div className="settings-subcard">
        <div className="settings-row">
          <div>
            <div className="settings-label">Initial height</div>
            <div className="settings-desc">Default height (px) of the bottom-sheet terminal when first opened (Ctrl+`). Drag the divider to resize once it's visible.</div>
          </div>
          <input
            type="number" min={80} max={800} step={10}
            className="settings-input" style={{ width: 90 }}
            value={coder.bottomTermHeight ?? 240}
            onChange={e => upd({ bottomTermHeight: Math.max(80, Math.min(800, Number(e.target.value) || 240)) })}
          />
        </div>
      </div>
    </div>
  )
}

function BundledModelsSection({ ai, upd }) {
  const [models, setModels] = useState([])
  const [recommend, setRecommend] = useState(null)
  const [progress, setProgress] = useState({})   // { [id]: { pct, got, total } }
  const [busy, setBusy] = useState({})           // { [id]: 'download' | 'load' | 'remove' }
  const [error, setError] = useState(null)

  function refresh() { window.nexterm.ai.bundledList().then(setModels) }

  useEffect(() => {
    refresh()
    window.nexterm.ai.bundledRecommend().then(setRecommend)
    const off = window.nexterm.ai.onBundledProgress?.((p) => {
      setProgress(s => ({ ...s, [p.id]: p }))
    })
    return () => { off?.() }
  }, [])

  function fmt(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
    return mb + ' MB'
  }

  async function download(id) {
    setError(null); setBusy(b => ({ ...b, [id]: 'download' }))
    const r = await window.nexterm.ai.bundledDownload(id)
    setBusy(b => { const x = { ...b }; delete x[id]; return x })
    setProgress(s => { const x = { ...s }; delete x[id]; return x })
    if (r?.cancelled) { refresh(); return }
    if (!r?.ok) setError(r?.error || 'Download failed')
    refresh()
  }
  async function cancelDownload(id) {
    await window.nexterm.ai.bundledCancel(id)
    // The download promise will reject with 'cancelled' and the busy state
    // clears in the download() handler above.
  }
  async function activate(id) {
    setError(null); setBusy(b => ({ ...b, [id]: 'load' }))
    const r = await window.nexterm.ai.bundledLoad(id)
    setBusy(b => { const x = { ...b }; delete x[id]; return x })
    if (!r?.ok) { setError(r?.error || 'Load failed'); return }
    upd({ bundled: { ...(ai.bundled || {}), model: id } })
    refresh()
  }
  async function remove(id) {
    if (!confirm('Delete this model from disk?')) return
    setError(null); setBusy(b => ({ ...b, [id]: 'remove' }))
    const r = await window.nexterm.ai.bundledRemove(id)
    setBusy(b => { const x = { ...b }; delete x[id]; return x })
    if (!r?.ok) setError(r?.error || 'Remove failed')
    if (ai.bundled?.model === id) upd({ bundled: { ...(ai.bundled || {}), model: null } })
    refresh()
  }

  return (
    <div className="settings-subcard">
      <p className="section-title" style={{ marginTop: 0 }}>Bundled AI engine (node-llama-cpp)</p>
      <div className="settings-desc" style={{ marginBottom: 10 }}>
        Models run <strong>inside NexTerm</strong> — no Ollama daemon, no external dependency, no version-mismatch breakage. Pick a model that fits your hardware. NexTerm will download it once and use it forever.
      </div>
      {recommend && (
        <div className="settings-desc" style={{ marginBottom: 10, opacity: 0.85 }}>
          🖥 Detected: <strong>{recommend.ramGB} GB RAM</strong>, GPU: <em>{String(recommend.gpu).slice(0, 60)}</em>
          {' · Recommended: '}<strong>{models.find(m => m.id === recommend.recommendedId)?.name || recommend.recommendedId}</strong>
        </div>
      )}
      {error && <div className="settings-desc" style={{ color: '#ef4444' }}>⚠ {error}</div>}
      {models.map(m => {
        const isActive = ai.bundled?.model === m.id
        const isRec    = recommend?.recommendedId === m.id
        const p = progress[m.id]
        const b = busy[m.id]
        return (
          <div key={m.id} style={{ padding: 10, marginBottom: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: isActive ? '1px solid var(--accent)' : '1px solid transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ flex: 1 }}>{m.name}</strong>
              {isRec && <span className="settings-tag" style={{ background: 'rgba(34,197,94,0.18)', color: '#22c55e' }}>RECOMMENDED</span>}
              {isActive && <span className="settings-tag" style={{ background: 'rgba(74,158,255,0.18)', color: 'var(--accent)' }}>ACTIVE</span>}
              <span className="settings-desc" style={{ marginRight: 6 }}>{fmt(m.sizeMB)} · ≥ {m.minRamGB} GB RAM</span>
              {!m.downloaded && !b && (
                <button className="btn-primary" onClick={() => download(m.id)} disabled={!!b}>
                  {progress[m.id]?.got > 0 ? 'Resume' : 'Download'}
                </button>
              )}
              {b === 'download' && (
                <>
                  {p?.status === 'finalizing' ? (
                    <span className="settings-desc">Finalizing…</span>
                  ) : p ? (
                    <span className="settings-desc">
                      {(p.pct * 100).toFixed(0)}% · {(p.got / 1024 / 1024).toFixed(0)}/{(p.total / 1024 / 1024).toFixed(0)} MB
                    </span>
                  ) : (
                    <span className="settings-desc">Starting…</span>
                  )}
                  {p?.status !== 'finalizing' && (
                    <button className="btn-secondary" onClick={() => cancelDownload(m.id)}>Cancel</button>
                  )}
                </>
              )}
              {m.downloaded && !isActive && !b && (
                <button className="btn-primary" onClick={() => activate(m.id)}>Activate</button>
              )}
              {m.downloaded && isActive && (
                <button className="btn-secondary" disabled>In use</button>
              )}
              {m.downloaded && !b && (
                <button className="btn-secondary" onClick={() => remove(m.id)} title="Delete model from disk">×</button>
              )}
              {b === 'load' && (
                <span className="settings-desc">
                  <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rec-blink 1s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                  Loading model into RAM…
                </span>
              )}
              {b === 'remove' && <span className="settings-desc">deleting…</span>}
            </div>
            <div className="settings-desc" style={{ marginTop: 6 }}>{m.desc}</div>
            {b === 'download' && p && (
              <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${p.pct * 100}%`,
                    height: '100%',
                    background: p.status === 'finalizing'
                      ? 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 50%, white))'
                      : 'var(--accent)',
                    transition: 'width 0.15s',
                    animation: p.status === 'finalizing' ? 'rec-blink 1.2s ease-in-out infinite' : 'none'
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AiSection({ settings, set }) {
  const ai = settings.ai || { enabled: false, mode: 'cloud',
    cloud: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    local: { model: 'qwen2.5-coder:7b' },
    privacy: { sendCwd: true, sendShell: true, sendLastCommand: true, redactEnvVars: true, redactHomePath: false } }

  const [hw, setHw]       = useState(null)
  const [ollama, setOllama] = useState(null)
  const [localModels, setLocalModels] = useState([])
  const [apiKey,  setApiKey]  = useState('')
  const [testResult, setTestResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [installProgress, setInstallProgress] = useState(null)
  const [pullProgress, setPullProgress] = useState(null)

  function upd(patch) { set({ ai: { ...ai, ...patch } }) }
  function updCloud(patch) { upd({ cloud: { ...(ai.cloud || {}), ...patch } }) }
  function updLocal(patch) { upd({ local: { ...(ai.local || {}), ...patch } }) }
  function updPrivacy(patch) { upd({ privacy: { ...(ai.privacy || {}), ...patch } }) }

  const [ollamaRunning, setOllamaRunning] = useState(false)
  function refreshOllama() {
    window.nexterm.ai.detectOllama().then(setOllama)
    window.nexterm.ai.isOllamaRunning().then(setOllamaRunning)
    window.nexterm.ai.listLocalModels().then(setLocalModels)
  }

  async function startOllama() {
    setBusy(true)
    const r = await window.nexterm.ai.startOllama()
    setBusy(false)
    if (r.ok) {
      setTestResult({ ok: true, msg: r.alreadyRunning ? 'Daemon already running.' : 'Daemon started.' })
    } else {
      setTestResult({ ok: false, msg: r.error || 'Failed to start daemon' })
    }
    refreshOllama()
  }

  useEffect(() => {
    window.nexterm.ai.detectHardware().then(setHw)
    refreshOllama()
    const offInstall = window.nexterm.ai.onInstallProgress(setInstallProgress)
    const offPull    = window.nexterm.ai.onPullProgress(setPullProgress)
    return () => { offInstall?.(); offPull?.() }
  }, [])

  async function installOllama() {
    setBusy(true); setInstallProgress({ phase: 'starting', percent: 0 })
    const r = await window.nexterm.ai.installOllama()
    setBusy(false)
    setInstallProgress(r.ok ? { phase: 'done', percent: 100 } : null)
    if (!r.ok) setTestResult({ ok: false, msg: r.error })
    refreshOllama()
  }

  async function pullModel(name) {
    if (!name) return
    setBusy(true); setPullProgress({ status: 'starting', percent: 0 })
    const r = await window.nexterm.ai.pullModel(name)
    setBusy(false)
    if (!r.ok) setTestResult({ ok: false, msg: r.error })
    setPullProgress(null)
    refreshOllama()
  }

  const provider = ai.mode === 'local' ? 'ollama' : (ai.cloud?.provider || 'groq')

  // Load any saved API key for the active cloud provider
  useEffect(() => {
    if (ai.mode !== 'cloud') return
    window.nexterm.vault.get(`ai.${provider}.apiKey`).then(k => setApiKey(k || ''))
  }, [provider, ai.mode])

  async function saveApiKey() {
    if (!apiKey.trim()) return
    setBusy(true)
    try {
      await window.nexterm.vault.set({
        name: `ai.${provider}.apiKey`,
        value: apiKey.trim(),
        description: `AI API key for ${provider}`
      })
      setTestResult({ ok: true, msg: 'Key saved to encrypted vault.' })
    } catch (e) {
      setTestResult({ ok: false, msg: String(e?.message || e) })
    }
    setBusy(false)
  }

  async function testConnection() {
    setBusy(true); setTestResult(null)
    try {
      let key = null
      if (ai.mode === 'cloud') {
        key = apiKey.trim() || await window.nexterm.vault.get(`ai.${provider}.apiKey`)
      }
      const r = await window.nexterm.ai.testProvider({ provider, apiKey: key })
      setTestResult(r.ok ? { ok: true, msg: 'Connection successful.' }
                         : { ok: false, msg: r.error || 'Failed' })
    } catch (e) {
      setTestResult({ ok: false, msg: String(e?.message || e) })
    }
    setBusy(false)
  }

  async function testGeneration() {
    setBusy(true); setTestResult({ ok: true, msg: 'Generating a test response… (this proves the full inference pipeline works)' })
    try {
      const mode    = ai.mode || 'bundled'
      const provider2 = mode === 'bundled' ? 'bundled'
                     : mode === 'local'    ? 'ollama'
                                           : (ai.cloud?.provider || 'groq')
      const model2  = mode === 'bundled' ? (ai.bundled?.model || '')
                     : mode === 'local'  ? (ai.local?.model || 'qwen2.5-coder:7b')
                                         : resolveCloudModel(provider2, ai.cloud?.model)
      if (mode === 'bundled' && !model2) {
        setTestResult({ ok: false, msg: 'No built-in model selected — pick one first.' }); setBusy(false); return
      }
      let key = null
      if (mode === 'cloud') {
        key = await window.nexterm.vault.get(`ai.${provider2}.apiKey`)
        if (!key) { setTestResult({ ok: false, msg: 'No API key — save one first.' }); setBusy(false); return }
      }
      const t0 = Date.now()
      const r = await window.nexterm.ai.complete({
        provider: provider2, model: model2, apiKey: key,
        prompt: 'Reply with exactly the three words: hello from nexterm',
        system: 'You are a terse test assistant. Reply with the exact words requested.'
      })
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      if (r.ok) setTestResult({ ok: true,  msg: `✓ Response in ${dt}s: "${(r.text || '').slice(0, 200)}"` })
      else      setTestResult({ ok: false, msg: r.error || 'No response' })
    } catch (e) {
      setTestResult({ ok: false, msg: String(e?.message || e) })
    }
    setBusy(false)
  }

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div>
          <div className="settings-label">Enable AI</div>
          <div className="settings-desc">Press <code>Ctrl+Shift+A</code> to open the natural-language command bar in any tab.</div>
        </div>
        <Toggle checked={ai.enabled === true} onChange={v => upd({ enabled: v })} />
      </div>

      {hw && (
        <div className="settings-subcard" style={{ padding: 12 }}>
          <div className="settings-label" style={{ marginBottom: 8 }}>Your hardware</div>
          <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.7, fontFamily: 'monospace' }}>
            <div>CPU: {hw.hardware.cpu.model} ({hw.hardware.cpu.cores} cores)</div>
            <div>RAM: {hw.hardware.ram.totalGb} GB total · {hw.hardware.ram.freeGb} GB free</div>
            <div>GPU: {hw.hardware.gpu
              ? `${hw.hardware.gpu.name} · ${(hw.hardware.gpu.vramMb/1024).toFixed(1)} GB VRAM`
              : '(none detected)'}</div>
          </div>
          <div style={{ marginTop: 10, padding: 8, background: 'var(--surface)', borderRadius: 4, fontSize: 11 }}>
            <strong>Tier {hw.recommendation.tier} — {hw.recommendation.label}</strong>
            <div style={{ opacity: 0.75, marginTop: 2 }}>{hw.recommendation.note}</div>
            {hw.recommendation.model && (
              <div style={{ marginTop: 4, opacity: 0.75 }}>
                Recommended local model: <code>{hw.recommendation.model}</code>
                {' '}({hw.recommendation.sizeGb} GB · {hw.recommendation.expectedSpeed})
              </div>
            )}
          </div>
        </div>
      )}

      <div className="settings-row">
        <div>
          <div className="settings-label">Mode</div>
          <div className="settings-desc">Pick where AI runs. Cloud is fastest with free tiers; local is private but needs Ollama installed.</div>
        </div>
        <div className="cursor-opts">
          {[
            { id: 'bundled', label: 'Bundled (built-in)' },
            { id: 'cloud',   label: 'Cloud (free APIs)' },
            { id: 'local',   label: 'Local (Ollama)' }
          ].map(m => (
            <button
              key={m.id}
              className={`cursor-opt ${ai.mode === m.id ? 'active' : ''}`}
              onClick={() => upd({ mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {ai.mode === 'bundled' && <BundledModelsSection ai={ai} upd={upd} />}
      {ai.mode === 'bundled' && <GpuRuntimeManager />}

      {ai.mode === 'cloud' && (() => {
        const provInfo = CLOUD_PROVIDERS.find(p => p.id === (ai.cloud?.provider || 'groq')) || CLOUD_PROVIDERS[0]
        return (
        <>
          <div className="settings-row">
            <div>
              <div className="settings-label">Provider</div>
              <div className="settings-desc">All listed here have generous free tiers. Pick one and grab a free API key.</div>
            </div>
            <select
              className="settings-select"
              value={ai.cloud?.provider || 'groq'}
              onChange={e => {
                const next = CLOUD_PROVIDERS.find(p => p.id === e.target.value) || CLOUD_PROVIDERS[0]
                updCloud({ provider: next.id, model: next.defaultModel })
              }}
              style={{ minWidth: 260 }}
            >
              {CLOUD_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Model</div>
              <div className="settings-desc">Default for {provInfo.id} is <code>{provInfo.defaultModel}</code>. Override here if you want a different one.</div>
            </div>
            <input
              className="settings-input"
              style={{ minWidth: 260 }}
              value={ai.cloud?.model || provInfo.defaultModel}
              onChange={e => updCloud({ model: e.target.value })}
            />
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="settings-label">API Key</div>
              <div className="settings-desc">Stored encrypted in your NexTerm vault — never in plain settings.json.</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
              <input
                className="settings-input"
                type="password"
                placeholder={provInfo.id === 'groq' ? 'gsk_...' : provInfo.id === 'gemini' ? 'AIza...' : '...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ minWidth: 260 }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => window.nexterm.shell.open(provInfo.keyUrl)}>Get free key ↗</button>
                <button className="btn-secondary" onClick={testConnection} disabled={busy}>Test key</button>
                <button className="btn-secondary" onClick={testGeneration} disabled={busy}>Test generation</button>
                <button className="btn-primary"   onClick={saveApiKey}     disabled={busy || !apiKey.trim()}>Save</button>
              </div>
            </div>
          </div>
        </>
        )
      })()}

      {ai.mode === 'local' && (
        <>
          <div className="settings-subcard" style={{ padding: 12 }}>
            <div className="settings-label" style={{ marginBottom: 6 }}>Ollama status</div>
            <div style={{ fontSize: 11 }}>
              {!ollama?.installed
                ? <span style={{ color: '#ef4444' }}>✗ Not installed</span>
                : ollamaRunning
                  ? <span style={{ color: '#22c55e' }}>✓ Installed{ollama.version ? ` (v${ollama.version})` : ''} · daemon running</span>
                  : <span style={{ color: '#eab308' }}>● Installed{ollama.version ? ` (v${ollama.version})` : ''}, but daemon not running</span>}
            </div>
            {ollama?.installed && !ollamaRunning && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={startOllama} disabled={busy}>▶ Start Ollama</button>
                <button className="btn-secondary" onClick={refreshOllama}>Re-check</button>
              </div>
            )}
            {!ollama?.installed && (
              <>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={installOllama} disabled={busy}>
                    {busy && installProgress?.phase === 'downloading' ? 'Installing…' : '⬇ Auto-install Ollama'}
                  </button>
                  <button className="btn-secondary" onClick={() => window.nexterm.shell.open('https://ollama.com/download')}>
                    Manual download ↗
                  </button>
                  <button className="btn-secondary" onClick={refreshOllama}>Re-check</button>
                </div>
                {installProgress && (
                  <div style={{ marginTop: 10, fontSize: 11 }}>
                    <div style={{ opacity: 0.7, marginBottom: 4 }}>
                      {installProgress.phase === 'downloading'
                        ? `Downloading installer… ${installProgress.percent.toFixed(0)}% (${(installProgress.downloaded/1e6).toFixed(1)} / ${(installProgress.total/1e6).toFixed(1)} MB · ${(installProgress.speedBytesPerSec/1e6).toFixed(1)} MB/s)`
                        : installProgress.phase === 'installing' ? 'Running silent install…'
                        : installProgress.phase === 'done' ? '✓ Installed' : 'Starting…'}
                    </div>
                    <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${installProgress.percent || 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="settings-label">Local model</div>
              <div className="settings-desc">Pick a downloaded model, or pull a new one with one click.</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
              <select
                className="settings-select"
                value={ai.local?.model || 'qwen2.5-coder:7b'}
                onChange={e => updLocal({ model: e.target.value })}
                style={{ minWidth: 260 }}
              >
                {(localModels.length === 0
                  ? [<option key="default" value={ai.local?.model || 'qwen2.5-coder:7b'}>{ai.local?.model || 'qwen2.5-coder:7b (not yet downloaded)'}</option>]
                  : localModels.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.sizeGb} GB)</option>
                    )))}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-primary"
                  onClick={() => pullModel(ai.local?.model || 'qwen2.5-coder:7b')}
                  disabled={busy || !ollama?.installed}
                >
                  ⬇ Pull model
                </button>
                <button className="btn-secondary" onClick={refreshOllama}>Refresh list</button>
              </div>
            </div>
          </div>

          {pullProgress && (
            <div className="settings-subcard" style={{ padding: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                Pulling <code>{pullProgress.name || ai.local?.model}</code> — {pullProgress.status}
                {pullProgress.total > 0 && ` · ${pullProgress.percent.toFixed(0)}% (${(pullProgress.completed/1e9).toFixed(2)} / ${(pullProgress.total/1e9).toFixed(2)} GB)`}
              </div>
              <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ width: `${pullProgress.percent || 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          <div className="settings-row">
            <div>
              <div className="settings-label">Connection</div>
              <div className="settings-desc">Tests that the Ollama daemon is reachable on localhost:11434</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" onClick={testConnection} disabled={busy}>Test API</button>
              <button className="btn-primary"   onClick={testGeneration} disabled={busy}>Test generation</button>
            </div>
          </div>
        </>
      )}

      {testResult && (
        <div className={`settings-subcard`} style={{ padding: 10, color: testResult.ok ? '#22c55e' : '#ef4444' }}>
          {testResult.ok ? '✓ ' : '⚠ '}{testResult.msg}
        </div>
      )}

      {/* AI-based autocomplete was removed in favor of a static popular-
          commands list (no model needed, zero RAM, no quota). The list is
          edited from Settings → Terminal → Command Suggestions. */}

      <div style={{ marginTop: 12 }}>
        <div className="settings-label">Privacy</div>
        <div className="settings-desc" style={{ marginBottom: 6 }}>
          Control exactly what NexTerm sends to your AI provider. Local Ollama never leaves your machine; cloud providers see only what you allow below.
        </div>
        <div className="settings-subcard">
          <div className="settings-row">
            <div>
              <div className="settings-label">Send current directory</div>
              <div className="settings-desc">Include "Current directory: …" so the AI can suggest path-aware commands.</div>
            </div>
            <Toggle checked={(ai.privacy?.sendCwd) !== false} onChange={v => updPrivacy({ sendCwd: v })} />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Send shell name</div>
              <div className="settings-desc">Tells the AI you're on PowerShell so it generates the right syntax.</div>
            </div>
            <Toggle checked={(ai.privacy?.sendShell) !== false} onChange={v => updPrivacy({ sendShell: v })} />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Send last command (Explain & Fix)</div>
              <div className="settings-desc">When asking AI to explain an error, include the command that produced it.</div>
            </div>
            <Toggle checked={(ai.privacy?.sendLastCommand) !== false} onChange={v => updPrivacy({ sendLastCommand: v })} />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Redact secrets</div>
              <div className="settings-desc">Replace <code>API_KEY=…</code>, <code>TOKEN=…</code>, GitHub/OpenAI/Groq tokens, etc. before sending output. Recommended ON.</div>
            </div>
            <Toggle checked={(ai.privacy?.redactEnvVars) !== false} onChange={v => updPrivacy({ redactEnvVars: v })} />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Redact home path</div>
              <div className="settings-desc">Replace <code>C:\Users\YourName\…</code> with <code>~\…</code> when sending paths.</div>
            </div>
            <Toggle checked={(ai.privacy?.redactHomePath) === true} onChange={v => updPrivacy({ redactHomePath: v })} />
          </div>
        </div>
      </div>

      <div className="settings-desc" style={{ marginTop: 12, opacity: 0.55 }}>
        AI runs only when you explicitly invoke it (Ctrl+Shift+A or right-click → Explain & Fix). Nothing is sent automatically.
      </div>
    </div>
  )
}
