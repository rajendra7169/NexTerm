import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { ProfilesIcon, HistoryIcon, PaletteIcon, SettingsIcon } from './AppIcons'
import logoUrl from '../assets/logo.png'

async function safeClose() {
  const { tabs, settings } = useStore.getState()
  // Run in background → just hide instead of asking + closing
  if (settings.runInBackground === true) {
    window.nexterm.win.close()   // main intercepts and hides
    return
  }
  if (settings.warnMultiTab !== false && tabs.length > 1) {
    const ok = await window.nexterm.confirm({
      message: `Close ${tabs.length} tabs?`,
      detail: 'All running shells will be terminated.'
    })
    if (!ok) return
  }
  window.nexterm.win.close()
}

const MinIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const MaxIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
    <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export default function TitleBar({ onSettings, onHistory, onPalette, onProfiles, onAi }) {
  const settings  = useStore(s => s.settings)
  const placement = settings.windowButtons || 'right'
  const style     = settings.buttonStyle   || 'windows'

  const [isAdmin, setIsAdmin] = useState(false)
  const [isDev,   setIsDev]   = useState(false)
  useEffect(() => {
    window.nexterm.admin.is().then(setIsAdmin)
    window.nexterm.admin.isDev().then(setIsDev)
  }, [])

  async function toggleAdmin() {
    // No custom confirmation — UAC IS the elevation prompt, and de-elevation
    // is fast & reversible. Just react to the click.
    const r = isAdmin
      ? await window.nexterm.admin.relaunchAsUser()
      : await window.nexterm.admin.relaunchAsAdmin()
    // Only surface a dialog if it actually failed for a non-obvious reason
    // (UAC cancel returns ok:false but no message we need to escalate)
    if (!r?.ok && r?.error && !/canceled|cancelled/i.test(r.error)) {
      await window.nexterm.confirm({
        message: 'Relaunch failed',
        detail: r.error
      })
    }
  }

  const AdminBadge = (
    <button
      className={`admin-toggle ${isAdmin ? 'admin-on' : ''} no-drag`}
      onClick={toggleAdmin}
      title={isAdmin
        ? 'Admin Mode is ON — click to turn off (relaunch as normal user)'
        : 'Admin Mode is OFF — click to turn on (UAC will prompt)'}
    >
      <span className="admin-toggle-label">Admin Mode</span>
      <span className="admin-toggle-switch">
        <span className="admin-toggle-thumb" />
      </span>
    </button>
  )

  const macLike = style === 'mac' || style === 'macIcons'

  const Controls = (
    <div className={`win-controls win-style-${style}`}>
      {macLike ? (
        <>
          <button className="win-btn close"    onClick={safeClose}    title="Close">
            <span className="mac-icon">×</span>
          </button>
          <button className="win-btn minimize" onClick={() => window.nexterm.win.minimize()} title="Minimize">
            <span className="mac-icon">−</span>
          </button>
          <button className="win-btn maximize" onClick={() => window.nexterm.win.maximize()} title="Maximize">
            <span className="mac-icon">+</span>
          </button>
        </>
      ) : (
        <>
          <button className="win-btn minimize" onClick={() => window.nexterm.win.minimize()} title="Minimize"><MinIcon /></button>
          <button className="win-btn maximize" onClick={() => window.nexterm.win.maximize()} title="Maximize"><MaxIcon /></button>
          <button className="win-btn close"    onClick={safeClose}    title="Close"><CloseIcon /></button>
        </>
      )}
    </div>
  )

  const iconStyle = settings.appIconsStyle || '3d'
  const iconPos   = settings.appIconsPosition || 'right'

  const AppMenu = (
    <div className={`no-drag app-menu app-menu-${iconStyle}`}>
      <button className="app-icon-btn" onClick={onProfiles} title="SSH Profiles (Ctrl+Shift+S)"><ProfilesIcon style={iconStyle} /></button>
      <button className="app-icon-btn" onClick={onHistory}  title="History (Ctrl+H)"><HistoryIcon style={iconStyle} /></button>
      <button className="app-icon-btn" onClick={onPalette}  title="Command Palette (Ctrl+Shift+P)"><PaletteIcon style={iconStyle} /></button>
      <button className="app-icon-btn" onClick={onSettings} title="Settings (Ctrl+,)"><SettingsIcon style={iconStyle} /></button>
    </div>
  )

  // With titleBarStyle:'hidden', Windows handles double-click→maximize
  // natively on -webkit-app-region:drag areas. No JS handler needed.

  const isCenter = iconPos === 'center'
  return (
    <div
      className={`titlebar tb-${placement} tb-icons-${iconPos}`}
    >
      {placement === 'left' && Controls}
      <span className="tb-brand">
        <img src={logoUrl} className="tb-logo" alt="" draggable="false" />
        <span className="tb-title">NEXTERM</span>
      </span>
      {AdminBadge}
      <div style={{ flex: 1 }} />
      {isCenter && (<>{AppMenu}<div style={{ flex: 1 }} /></>)}
      {!isCenter && AppMenu}
      {placement === 'right' && Controls}
    </div>
  )
}
