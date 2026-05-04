import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { THEMES } from '../themes'
import AnsiText from './AnsiText'
import { ACTIONS, getKey, formatCombo } from '../shortcuts'

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

const SECTIONS = ['Appearance', 'Window', 'Startup', 'Font', 'Terminal', 'Shell', 'Aliases', 'Bookmarks', 'Snippets', 'Workspaces', 'Notifications', 'Vault', 'History', 'Shortcuts', 'Config']

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
