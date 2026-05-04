import { useEffect, useRef, useState } from 'react'

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
}

function joinPath(a, b) {
  if (b === '..') {
    const idx = a.replace(/\/$/, '').lastIndexOf('/')
    if (idx <= 0) return '/'
    return a.slice(0, idx) || '/'
  }
  if (a.endsWith('/')) return a + b
  return a + '/' + b
}

export default function SftpPanel({ profile, onClose }) {
  const [connId,  setConnId]  = useState(null)
  const [path,    setPath]    = useState('.')
  const [entries, setEntries] = useState([])
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)
  const dropRef = useRef(null)

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    window.nexterm.sftp.connect(profile).then(async r => {
      if (cancelled) return
      if (!r?.ok) { setError(r?.error || 'connect failed'); setBusy(false); return }
      setConnId(r.connId)
      // Resolve actual home directory
      const rp = await window.nexterm.sftp.realpath(r.connId, '.')
      const start = rp?.ok ? rp.path : '.'
      setPath(start)
      const list = await window.nexterm.sftp.list(r.connId, start)
      if (list?.ok) setEntries(list.entries)
      else setError(list?.error || 'list failed')
      setBusy(false)
    })
    return () => {
      cancelled = true
      if (connId) window.nexterm.sftp.disconnect(connId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh(p = path) {
    if (!connId) return
    setBusy(true)
    const r = await window.nexterm.sftp.list(connId, p)
    if (r?.ok) { setEntries(r.entries); setError(null) }
    else setError(r?.error || 'list failed')
    setBusy(false)
  }

  async function navigate(name, isDir) {
    if (!isDir) return
    const next = name === '..' ? joinPath(path, '..') : joinPath(path, name)
    setPath(next)
    refresh(next)
  }

  async function download(name) {
    if (!connId) return
    const r = await window.nexterm.sftp.download(connId, joinPath(path, name))
    if (r?.error) setError(r.error)
  }

  async function upload(localPath = null) {
    if (!connId) return
    const r = await window.nexterm.sftp.upload(connId, path, localPath)
    if (r?.ok) refresh()
    else if (r?.error) setError(r.error)
  }

  async function deleteEntry(name, isDir) {
    if (!connId) return
    const ok = await window.nexterm.confirm({
      message: `Delete ${isDir ? 'folder' : 'file'} "${name}"?`,
      detail: 'This cannot be undone.', danger: true
    })
    if (!ok) return
    const r = await window.nexterm.sftp.delete(connId, joinPath(path, name), isDir)
    if (r?.ok) refresh()
    else setError(r?.error || 'delete failed')
  }

  // Drag from OS → upload
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const onOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
    const onDrop = (e) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files || [])
      for (const f of files) {
        if (f.path) upload(f.path)
      }
    }
    el.addEventListener('dragover', onOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [connId, path])

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span>SFTP — {profile.name}</span>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
      </div>
      <div className="sftp-toolbar">
        <button className="btn-secondary" onClick={() => navigate('..', true)} title="Go up">↑</button>
        <input
          className="settings-input"
          style={{ flex: 1 }}
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') refresh(e.target.value) }}
        />
        <button className="btn-secondary" onClick={() => refresh()} title="Refresh">⟳</button>
        <button className="btn-primary"   onClick={() => upload()} title="Upload a file">Upload</button>
      </div>
      {error && <div className="sftp-error">⚠ {error}</div>}
      <div className="sftp-list" ref={dropRef}>
        {busy && <div className="sftp-empty">Loading…</div>}
        {!busy && entries.length === 0 && <div className="sftp-empty">Empty</div>}
        {!busy && entries.map(e => (
          <div key={e.name} className="sftp-row" onDoubleClick={() => navigate(e.name, e.isDir)}>
            <span className="sftp-icon">{e.isDir ? '📁' : '📄'}</span>
            <span className="sftp-name" title={e.longname || e.name}>{e.name}</span>
            <span className="sftp-size">{e.isDir ? '' : fmtSize(e.size)}</span>
            <span className="sftp-actions">
              {!e.isDir && <button className="icon-btn" onClick={() => download(e.name)} title="Download">⬇</button>}
              <button className="icon-btn" onClick={() => deleteEntry(e.name, e.isDir)} title="Delete">🗑</button>
            </span>
          </div>
        ))}
      </div>
      <div className="sftp-hint">Drop files here to upload to <code>{path}</code></div>
    </div>
  )
}
