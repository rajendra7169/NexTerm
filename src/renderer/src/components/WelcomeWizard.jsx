import { useState } from 'react'
import { useStore } from '../store'
import { THEMES, getTheme } from '../themes'
import AiSetup from './AiSetup'

// First-launch onboarding. 4 steps: theme → shell → AI → done.
// Sets settings.welcomeShown=true so it never appears again unless reset.
export default function WelcomeWizard({ onClose }) {
  const settings  = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const [step, setStep] = useState(0)

  const themeOptions = Object.keys(THEMES || {}).slice(0, 12)
  const shellOptions = [
    { value: 'powershell.exe', label: 'PowerShell 5', tag: 'PS' },
    { value: 'pwsh.exe',       label: 'PowerShell 7', tag: 'PS7' },
    { value: 'cmd.exe',        label: 'Command Prompt', tag: 'CMD' },
    { value: 'wsl.exe',        label: 'WSL (Linux)', tag: 'WSL' },
    { value: 'C:\\Program Files\\Git\\bin\\bash.exe', label: 'Git Bash', tag: 'BSH' }
  ]

  // updateSettings persists to disk; the old setSettings() path was
  // in-memory only, so wizard choices (theme, shell, welcomeShown) were
  // lost unless the user later touched Settings to trigger another save.
  function set(patch)  { updateSettings(patch) }
  function finish() {
    set({ welcomeShown: true })
    onClose?.()
  }
  function skip() { finish() }

  const steps = [
    {
      title: 'Welcome to NexTerm',
      subtitle: 'A modern, AI-powered terminal and code editor for Windows.',
      body: (
        <div className="ww-welcome">
          <div className="ww-logo">⌘</div>
          <ul className="ww-features">
            <li>🤖 Built-in AI chat with your terminal as context</li>
            <li>🧑‍💻 Coder Mode with Monaco editor + git integration</li>
            <li>🌐 SSH / SFTP profiles, jump-hosts, port forwarding</li>
            <li>🎨 19 themes, animated banners, Quake mode</li>
          </ul>
          <p className="ww-hint">Take 30 seconds to set things up?</p>
        </div>
      )
    },
    {
      title: 'Pick a theme',
      subtitle: 'You can change it anytime from Settings → Appearance.',
      body: (
        <div className="ww-themes">
          {themeOptions.map(id => {
            const t = getTheme(id)
            const active = settings.theme === id
            return (
              <div
                key={id}
                className={`ww-theme ${active ? 'active' : ''}`}
                style={{ background: t?.xterm?.background, color: t?.xterm?.foreground }}
                onClick={() => set({ theme: id })}
              >
                <div className="ww-theme-name">{id}</div>
                <div className="ww-theme-swatches">
                  {[t?.xterm?.red, t?.xterm?.green, t?.xterm?.blue, t?.xterm?.yellow, t?.xterm?.magenta, t?.xterm?.cyan].map((c, i) =>
                    <span key={i} style={{ background: c }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    },
    {
      title: 'Default shell',
      subtitle: 'Used when you open a new tab.',
      body: (
        <div className="ww-shells">
          {shellOptions.map(s => (
            <div
              key={s.value}
              className={`ww-shell ${settings.defaultShell === s.value ? 'active' : ''}`}
              onClick={() => set({ defaultShell: s.value })}
            >
              <span className="ww-shell-tag">{s.tag}</span>
              <span className="ww-shell-label">{s.label}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      title: 'AI Assistant',
      subtitle: 'Pick how NexTerm should run AI. You can change this anytime.',
      body: (
        <AiSetup
          compact
          onDone={() => { /* user finished AI setup — nothing else to do */ }}
          onSkip={() => { /* skipping is fine — keep current step */ }}
        />
      )
    },
    {
      title: "You're all set!",
      subtitle: 'A few power tips before you start:',
      body: (
        <div className="ww-tips">
          <div className="ww-tip"><kbd>Ctrl+T</kbd> new tab · <kbd>Ctrl+Shift+D</kbd>/<kbd>E</kbd> split panes</div>
          <div className="ww-tip"><kbd>Ctrl+Shift+P</kbd> command palette · <kbd>Ctrl+Shift+A</kbd> AI chat</div>
          <div className="ww-tip"><kbd>Ctrl+Shift+O</kbd> open project as code editor</div>
          <div className="ww-tip"><kbd>Ctrl+,</kbd> settings · <kbd>Ctrl+H</kbd> history</div>
          <div className="ww-tip">Drop any file onto a pane to paste its path · Ctrl+Scroll to zoom</div>
        </div>
      )
    }
  ]

  const s = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="ww-backdrop">
      <div className="ww-card">
        <div className="ww-header">
          <div className="ww-step-dots">
            {steps.map((_, i) => (
              <span key={i} className={`ww-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
            ))}
          </div>
          <button className="ww-skip" onClick={skip}>Skip</button>
        </div>
        <div className="ww-body">
          <h2 className="ww-title">{s.title}</h2>
          <p className="ww-subtitle">{s.subtitle}</p>
          {s.body}
        </div>
        <div className="ww-footer">
          {step > 0
            ? <button className="ww-btn-secondary" onClick={() => setStep(step - 1)}>Back</button>
            : <span />}
          {isLast
            ? <button className="ww-btn-primary" onClick={finish}>Get Started</button>
            : <button className="ww-btn-primary" onClick={() => setStep(step + 1)}>Next →</button>}
        </div>
      </div>
    </div>
  )
}
