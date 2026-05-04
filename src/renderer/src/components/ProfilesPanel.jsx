import { useState, useEffect } from 'react'
import { useStore } from '../store'

const EMPTY = {
  name: '', host: '', port: 22, username: '', identity_file: '', extra_args: '',
  tunnels: [], jump_hosts: [], auto_reconnect: false
}

export default function ProfilesPanel({ onClose }) {
  const [profiles, setProfiles] = useState([])
  const [editing, setEditing] = useState(null)   // null | 'new' | profile object
  const openProfile = useStore(s => s.openProfile)

  async function load() {
    const list = await window.nexterm.profile.list()
    setProfiles(list)
  }

  useEffect(() => { load() }, [])

  async function save(form) {
    if (!form.name || !form.host) return
    const payload = {
      ...form,
      port: Number(form.port) || 22,
      tunnels: (form.tunnels || []).filter(t => t.localPort),
      jump_hosts: (form.jump_hosts || []).filter(Boolean),
      auto_reconnect: !!form.auto_reconnect
    }
    if (form.id) {
      await window.nexterm.profile.update(payload)
    } else {
      await window.nexterm.profile.add(payload)
    }
    setEditing(null)
    load()
  }

  async function remove(id) {
    const ok = await window.nexterm.confirm({
      message: 'Delete this profile?',
      detail: 'The SSH profile will be removed permanently.',
      danger: true
    })
    if (!ok) return
    await window.nexterm.profile.delete(id)
    load()
  }

  function connect(p) {
    openProfile(p)
    onClose()
  }

  return (
    <div className="profiles-panel">
      <div className="profiles-header">
        <span>SSH Profiles</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ New</button>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>
      </div>

      {editing ? (
        <ProfileForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <div className="profiles-list">
          {profiles.length === 0 && (
            <div className="profiles-empty">
              No SSH profiles yet.<br />
              Click <strong>+ New</strong> to add one.
            </div>
          )}
          {profiles.map(p => (
            <div key={p.id} className="profile-card">
              <div className="profile-head">
                <span className="profile-name">{p.name}</span>
                <div className="profile-actions">
                  <button className="icon-btn" onClick={() => setEditing(p)} title="Edit">✎</button>
                  <button className="icon-btn" onClick={() => remove(p.id)} title="Delete">🗑</button>
                </div>
              </div>
              <div className="profile-meta">
                {p.username && <span>{p.username}@</span>}
                <span>{p.host}</span>
                {p.port && p.port !== 22 && <span>:{p.port}</span>}
              </div>
              <button className="btn-primary profile-connect" onClick={() => connect(p)}>
                Connect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="profile-form">
      <div className="form-row">
        <label>Name *</label>
        <input
          className="settings-input"
          autoFocus
          placeholder="My VPS"
          value={form.name}
          onChange={e => set('name', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Host *</label>
        <input
          className="settings-input"
          placeholder="example.com or 192.168.1.10"
          value={form.host}
          onChange={e => set('host', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Port</label>
        <input
          className="settings-input"
          type="number"
          placeholder="22"
          value={form.port}
          onChange={e => set('port', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Username</label>
        <input
          className="settings-input"
          placeholder="root"
          value={form.username || ''}
          onChange={e => set('username', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Identity File</label>
        <input
          className="settings-input"
          placeholder="C:\Users\...\.ssh\id_rsa"
          value={form.identity_file || ''}
          onChange={e => set('identity_file', e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Extra Args</label>
        <input
          className="settings-input"
          placeholder="-o ServerAliveInterval=60"
          value={form.extra_args || ''}
          onChange={e => set('extra_args', e.target.value)}
        />
      </div>

      <div className="form-row" style={{ alignItems: 'flex-start' }}>
        <label>Jump Hosts</label>
        <div style={{ flex: 1 }}>
          {(form.jump_hosts || []).map((jh, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input
                className="settings-input"
                placeholder="user@bastion.example.com:22"
                value={jh}
                onChange={e => {
                  const next = [...form.jump_hosts]; next[i] = e.target.value
                  set('jump_hosts', next)
                }}
                style={{ flex: 1 }}
              />
              <button className="icon-btn" onClick={() => set('jump_hosts', form.jump_hosts.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('jump_hosts', [...(form.jump_hosts || []), ''])}>+ Add jump host</button>
        </div>
      </div>

      <div className="form-row" style={{ alignItems: 'flex-start' }}>
        <label>Tunnels</label>
        <div style={{ flex: 1 }}>
          {(form.tunnels || []).map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
              <select
                className="settings-select"
                value={t.type || 'L'}
                onChange={e => {
                  const next = [...form.tunnels]; next[i] = { ...t, type: e.target.value }
                  set('tunnels', next)
                }}
                style={{ minWidth: 60 }}
                title="L = Local forward, R = Remote forward, D = Dynamic SOCKS"
              >
                <option value="L">-L</option>
                <option value="R">-R</option>
                <option value="D">-D</option>
              </select>
              <input
                className="settings-input"
                placeholder="local"
                type="number"
                value={t.localPort || ''}
                onChange={e => {
                  const next = [...form.tunnels]; next[i] = { ...t, localPort: e.target.value }
                  set('tunnels', next)
                }}
                style={{ width: 70 }}
              />
              {t.type !== 'D' && (
                <>
                  <input
                    className="settings-input"
                    placeholder="remote host"
                    value={t.remoteHost || ''}
                    onChange={e => {
                      const next = [...form.tunnels]; next[i] = { ...t, remoteHost: e.target.value }
                      set('tunnels', next)
                    }}
                    style={{ flex: 1, minWidth: 100 }}
                  />
                  <input
                    className="settings-input"
                    placeholder="port"
                    type="number"
                    value={t.remotePort || ''}
                    onChange={e => {
                      const next = [...form.tunnels]; next[i] = { ...t, remotePort: e.target.value }
                      set('tunnels', next)
                    }}
                    style={{ width: 70 }}
                  />
                </>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={t.enabled !== false}
                  onChange={e => {
                    const next = [...form.tunnels]; next[i] = { ...t, enabled: e.target.checked }
                    set('tunnels', next)
                  }}
                />
                On
              </label>
              <button className="icon-btn" onClick={() => set('tunnels', form.tunnels.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary"
            onClick={() => set('tunnels', [...(form.tunnels || []), { type: 'L', localPort: '', remoteHost: 'localhost', remotePort: '', enabled: true }])}
          >+ Add tunnel</button>
        </div>
      </div>

      <div className="form-row">
        <label>Auto-reconnect</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={!!form.auto_reconnect}
            onChange={e => set('auto_reconnect', e.target.checked)}
          />
          Reopen this SSH session automatically when it drops (exponential backoff)
        </label>
      </div>

      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  )
}
