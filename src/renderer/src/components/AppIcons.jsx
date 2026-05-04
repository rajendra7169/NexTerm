// Theme-aware realistic icons. Gradient stops pull from the active theme via CSS vars.

// ── Flat — solid theme accent fills ────────────────────────────────────────
const FlatBolt = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M14 2 L4 13 L10 13 L8 22 L20 9 L13 9 L15 2 Z"
          fill="var(--c-byellow)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
  </svg>
)
const FlatClock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="var(--c-bblue)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
    <line x1="12" y1="12" x2="12" y2="7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="12" y1="12" x2="15" y2="14" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const FlatPalette = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="1.5" fill="var(--c-bmagenta)" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" fill="var(--c-bblue)" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" fill="var(--c-bgreen)" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="var(--c-byellow)" />
  </svg>
)
const FlatGear = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fillRule="evenodd"
      d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .34.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5 0-1.93 1.57-3.5 3.5-3.5 1.93 0 3.5 1.57 3.5 3.5 0 1.93-1.57 3.5-3.5 3.5z"
      fill="var(--accent)" />
  </svg>
)

// ── Outline — line-only with theme-color stroke ─────────────────────────────
const OutlineBolt = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-byellow)" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2 L4 13 L10 13 L8 22 L20 9 L13 9 L15 2 Z" />
  </svg>
)
const OutlineClock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-bblue)" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="12" x2="12" y2="7" />
    <line x1="12" y1="12" x2="15" y2="14" />
  </svg>
)
const OutlinePalette = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-bmagenta)" strokeWidth="1.6" aria-hidden="true">
    <rect x="3"  y="3"  width="8" height="8" rx="1.5" />
    <rect x="13" y="3"  width="8" height="8" rx="1.5" />
    <rect x="3"  y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </svg>
)
const OutlineGear = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </svg>
)

// ── Unicode — emoji-style icons ─────────────────────────────────────────────
const UniBolt    = () => <span style={{ fontSize: 16, lineHeight: 1 }}>⚡</span>
const UniClock   = () => <span style={{ fontSize: 16, lineHeight: 1 }}>🕘</span>
const UniPalette = () => <span style={{ fontSize: 16, lineHeight: 1 }}>🧰</span>
const UniGear    = () => <span style={{ fontSize: 16, lineHeight: 1 }}>⚙</span>

// ── Style picker — choose from 3d/flat/outline/unicode ─────────────────────
function pickIcon(style, kind) {
  const set = {
    '3d':      { bolt: ThreeDBolt,  clock: ThreeDClock,  palette: ThreeDPalette, gear: ThreeDGear  },
    flat:      { bolt: FlatBolt,    clock: FlatClock,    palette: FlatPalette,   gear: FlatGear    },
    outline:   { bolt: OutlineBolt, clock: OutlineClock, palette: OutlinePalette,gear: OutlineGear },
    unicode:   { bolt: UniBolt,     clock: UniClock,     palette: UniPalette,    gear: UniGear     }
  }
  const map = set[style] || set['3d']
  return map[kind]
}

export const ProfilesIcon = ({ style }) => { const C = pickIcon(style, 'bolt');    return <C /> }
export const HistoryIcon  = ({ style }) => { const C = pickIcon(style, 'clock');   return <C /> }
export const PaletteIcon  = ({ style }) => { const C = pickIcon(style, 'palette'); return <C /> }
export const SettingsIcon = ({ style }) => { const C = pickIcon(style, 'gear');    return <C /> }

// ── 3D realistic versions (the originals) ───────────────────────────────────
const ThreeDBolt = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <defs>
      <radialGradient id="bolt-halo" cx="0.5" cy="0.5" r="0.7">
        <stop offset="0"    stopColor="var(--c-byellow)" stopOpacity="0.6" />
        <stop offset="0.45" stopColor="var(--c-blue)"    stopOpacity="0.3" />
        <stop offset="1"    stopColor="var(--bg)"        stopOpacity="0" />
      </radialGradient>
      <linearGradient id="bolt-body" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0"    stopColor="var(--c-byellow)" />
        <stop offset="0.5"  stopColor="var(--c-yellow)" />
        <stop offset="1"    stopColor="var(--c-red)" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="11" fill="url(#bolt-halo)" />
    <path
      d="M14 2 L3.5 13.5 L10 13.5 L8 22 L20.5 9 L13 9 L15 2 Z"
      fill="url(#bolt-body)"
      stroke="rgba(0,0,0,0.45)"
      strokeWidth="0.5"
      strokeLinejoin="round"
    />
    <path d="M14 2.5 L5 13 L8 13 L13 6 Z" fill="rgba(255,255,255,0.55)" />
  </svg>
)

const ThreeDClock = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <defs>
      <linearGradient id="clock-ring" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"    stopColor="var(--c-bcyan)" />
        <stop offset="0.5"  stopColor="var(--c-blue)" />
        <stop offset="1"    stopColor="var(--c-cyan)" />
      </linearGradient>
      <radialGradient id="clock-face" cx="0.4" cy="0.3" r="0.85">
        <stop offset="0"    stopColor="rgba(255,255,255,0.95)" />
        <stop offset="0.5"  stopColor="rgba(255,255,255,0.65)" />
        <stop offset="1"    stopColor="var(--c-blue)" />
      </radialGradient>
    </defs>
    <circle cx="12" cy="12" r="10.5" fill="url(#clock-ring)" />
    <circle cx="12" cy="12" r="8.5" fill="url(#clock-face)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" />
    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => (
      <line key={a}
        x1="12" y1="4.5" x2="12" y2={a % 90 === 0 ? 6 : 5.5}
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={a % 90 === 0 ? 0.9 : 0.4}
        strokeLinecap="round"
        transform={`rotate(${a} 12 12)`}
      />
    ))}
    <line x1="12" y1="12" x2="12"   y2="7.5" stroke="rgba(0,0,0,0.9)" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="12" x2="15.8" y2="13.2" stroke="rgba(0,0,0,0.9)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="12" y1="12.6" x2="12" y2="6.5" stroke="var(--c-red)" strokeWidth="0.55" strokeLinecap="round" />
    <circle cx="12" cy="12" r="0.9" fill="rgba(0,0,0,0.85)" />
    <circle cx="12" cy="12" r="0.3" fill="var(--c-red)" />
    <path d="M5 8 Q9 5 14 6 Q11 8 7 11 Z" fill="rgba(255,255,255,0.55)" />
  </svg>
)

const ThreeDPalette = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <defs>
      <linearGradient id="app-A" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--c-bmagenta)" /><stop offset="1" stopColor="var(--c-magenta)" />
      </linearGradient>
      <linearGradient id="app-B" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--c-bblue)" /><stop offset="1" stopColor="var(--c-blue)" />
      </linearGradient>
      <linearGradient id="app-C" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--c-bgreen)" /><stop offset="1" stopColor="var(--c-green)" />
      </linearGradient>
      <linearGradient id="app-D" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--c-byellow)" /><stop offset="1" stopColor="var(--c-yellow)" />
      </linearGradient>
    </defs>
    {[
      { x: 2,  y: 2,  fill: 'url(#app-A)' },
      { x: 13, y: 2,  fill: 'url(#app-B)' },
      { x: 2,  y: 13, fill: 'url(#app-C)' },
      { x: 13, y: 13, fill: 'url(#app-D)' }
    ].map((a, i) => (
      <g key={i}>
        <rect x={a.x} y={a.y} width="9" height="9" rx="2.4" fill={a.fill} stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" />
        <rect x={a.x + 0.5} y={a.y + 0.5} width="8" height="3.5" rx="2" fill="rgba(255,255,255,0.4)" />
        <rect x={a.x + 1.5} y={a.y + 1} width="3" height="1.2" rx="0.6" fill="rgba(255,255,255,0.6)" />
      </g>
    ))}
  </svg>
)

const ThreeDGear = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <defs>
      <linearGradient id="gear-grad" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0"    stopColor="var(--c-bcyan)" />
        <stop offset="0.45" stopColor="var(--accent)" />
        <stop offset="0.85" stopColor="var(--c-blue)" />
        <stop offset="1"    stopColor="var(--c-magenta)" />
      </linearGradient>
    </defs>
    <path
      fillRule="evenodd"
      d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .34.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5 0-1.93 1.57-3.5 3.5-3.5 1.93 0 3.5 1.57 3.5 3.5 0 1.93-1.57 3.5-3.5 3.5z"
      fill="url(#gear-grad)"
      stroke="rgba(0,0,0,0.6)"
      strokeWidth="0.5"
    />
    <ellipse cx="10" cy="5.5" rx="5" ry="1.3" fill="rgba(255,255,255,0.55)" />
  </svg>
)
