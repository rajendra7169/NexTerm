import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'

// Extensions panel — VS Code-style marketplace UI for NexTerm. Fetches a
// remote registry.json (hosted on GitHub via jsDelivr CDN), renders each
// extension as a card with install/uninstall buttons. For v1 every listed
// extension is actually a feature built into NexTerm gated behind an
// install flag; installing flips the flag and unlocks the feature.
export default function ExtensionsPanel() {
  const settings           = useStore(s => s.settings)
  const updateSettings     = useStore(s => s.updateSettings)
  const installed          = settings.installedExtensions || []
  const registryUrl        = settings.extensionsRegistryUrl

  const [registry, setRegistry] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [query,    setQuery]    = useState('')
  const [tab,      setTab]      = useState('marketplace')  // marketplace | installed
  const [selected, setSelected] = useState(null)            // extensionId open in detail view

  useEffect(() => {
    fetchRegistry()
    // Re-fetch when window regains focus, so users see new extensions
    // without restarting the app.
    const onFocus = () => fetchRegistry()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [registryUrl])

  async function fetchRegistry() {
    if (!registryUrl) { setError('No registry URL configured'); return }
    setLoading(true); setError(null)
    try {
      // Cache-bust at the CDN edge. jsDelivr aggressively caches @main and
      // even POST /purge can leave stale edges serving for a while; adding
      // a query param creates a different cache key.
      const sep = registryUrl.includes('?') ? '&' : '?'
      const url = `${registryUrl}${sep}_=${Date.now()}`
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error(`Registry fetch failed: HTTP ${r.status}`)
      const data = await r.json()
      setRegistry(data)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  function install(ext) {
    const next = [...new Set([...installed, ext.id])]
    updateSettings({ installedExtensions: next })
  }
  function uninstall(extId) {
    updateSettings({ installedExtensions: installed.filter(id => id !== extId) })
  }

  const all = registry?.extensions || []
  const filtered = useMemo(() => {
    const list = tab === 'installed'
      ? all.filter(e => installed.includes(e.id))
      : all
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(e =>
      e.name?.toLowerCase().includes(q)
      || e.description?.toLowerCase().includes(q)
      || e.publisher?.toLowerCase().includes(q)
      || (e.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }, [all, installed, tab, query])

  const detail = selected ? all.find(e => e.id === selected) : null
  if (detail) return <ExtensionDetail ext={detail} installed={installed.includes(detail.id)}
                                       onInstall={() => install(detail)}
                                       onUninstall={() => uninstall(detail.id)}
                                       onBack={() => setSelected(null)} />

  return (
    <div className="ext-panel">
      <div className="ext-header">
        <span className="ext-title">EXTENSIONS</span>
        <button className="ext-icon-btn" title="Refresh" onClick={fetchRegistry}>↻</button>
      </div>

      <div className="ext-search-wrap">
        <input
          className="ext-search"
          placeholder="Search extensions in Marketplace"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="ext-tabs">
        <button className={`ext-tab ${tab === 'marketplace' ? 'active' : ''}`}
                onClick={() => setTab('marketplace')}>
          Marketplace {all.length > 0 && <span className="ext-tab-count">{all.length}</span>}
        </button>
        <button className={`ext-tab ${tab === 'installed' ? 'active' : ''}`}
                onClick={() => setTab('installed')}>
          Installed {installed.length > 0 && <span className="ext-tab-count">{installed.length}</span>}
        </button>
      </div>

      <div className="ext-list">
        {loading && <div className="ext-empty">Loading registry…</div>}
        {error && (
          <div className="ext-error">
            <div>Couldn't load extension registry.</div>
            <div className="ext-error-detail">{error}</div>
            <button className="ext-btn ext-btn-sm" onClick={fetchRegistry}>Retry</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="ext-empty">
            {tab === 'installed' ? 'No extensions installed yet.' : 'No extensions match your search.'}
          </div>
        )}
        {filtered.map(ext => (
          <ExtensionCard
            key={ext.id}
            ext={ext}
            installed={installed.includes(ext.id)}
            onInstall={() => install(ext)}
            onUninstall={() => uninstall(ext.id)}
            onOpen={() => setSelected(ext.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ExtensionCard({ ext, installed, onInstall, onUninstall, onOpen }) {
  return (
    <div className="ext-card" onClick={onOpen}>
      <img className="ext-icon" src={ext.icon} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="ext-body">
        <div className="ext-card-head">
          <span className="ext-name">{ext.name}</span>
          <span className="ext-version">v{ext.version || '0.0.0'}</span>
        </div>
        <div className="ext-publisher">{ext.publisher}</div>
        <div className="ext-desc">{ext.description}</div>
        <div className="ext-card-foot">
          <span className="ext-meta">
            {ext.installs != null && <span className="ext-meta-pill">⬇ {formatCount(ext.installs)}</span>}
            {ext.rating  != null && <span className="ext-meta-pill">★ {ext.rating}</span>}
          </span>
          {installed
            ? <button className="ext-btn ext-btn-installed" onClick={e => { e.stopPropagation(); onUninstall() }}>Uninstall</button>
            : <button className="ext-btn ext-btn-install"   onClick={e => { e.stopPropagation(); onInstall() }}>Install</button>}
        </div>
      </div>
    </div>
  )
}

function ExtensionDetail({ ext, installed, onInstall, onUninstall, onBack }) {
  return (
    <div className="ext-panel">
      <div className="ext-header">
        <button className="ext-icon-btn" title="Back" onClick={onBack}>←</button>
        <span className="ext-title">EXTENSION</span>
      </div>
      <div className="ext-detail">
        <div className="ext-detail-head">
          <img className="ext-detail-icon" src={ext.icon} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ext-detail-title">{ext.name}</div>
            <div className="ext-detail-publisher">{ext.publisher} · v{ext.version || '0.0.0'}</div>
            <div className="ext-detail-desc">{ext.description}</div>
            <div className="ext-detail-actions">
              {installed
                ? <button className="ext-btn ext-btn-installed" onClick={onUninstall}>Uninstall</button>
                : <button className="ext-btn ext-btn-install"   onClick={onInstall}>Install</button>}
              {ext.repository && (
                <a className="ext-link" href={ext.repository} target="_blank" rel="noreferrer">Repository</a>
              )}
            </div>
          </div>
        </div>

        {(ext.screenshots?.length > 0) && (
          <div className="ext-screenshots">
            {ext.screenshots.map((src, i) => (
              <img key={i} src={src} alt={`screenshot ${i + 1}`} onError={e => { e.currentTarget.style.display = 'none' }} />
            ))}
          </div>
        )}

        {ext.longDescription && (
          <div className="ext-long">
            {ext.longDescription.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}

        <div className="ext-detail-meta">
          {ext.installs != null && <div><b>Installs:</b> {formatCount(ext.installs)}</div>}
          {ext.rating  != null && <div><b>Rating:</b> {ext.rating} ★</div>}
          {ext.added   && <div><b>Added:</b> {ext.added}</div>}
          {ext.requires?.nexterm && <div><b>Requires NexTerm:</b> {ext.requires.nexterm}</div>}
          {ext.tags?.length > 0 && (
            <div><b>Tags:</b> {ext.tags.join(', ')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCount(n) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}
