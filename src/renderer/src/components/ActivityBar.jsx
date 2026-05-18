// Thin vertical icon strip on the far left of the coder shell. Switches the
// sidebar between Explorer / Source Control. Click an already-active icon to
// hide the sidebar entirely (VS Code behavior).
export default function ActivityBar({ mode, onChange }) {
  const items = [
    {
      id: 'explorer',
      title: 'Explorer (Ctrl+Shift+E)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 5h6l2 2h10v12H3z" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'git',
      title: 'Source Control (Ctrl+Shift+G)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="6" cy="18" r="2.4" />
          <circle cx="18" cy="12" r="2.4" />
          <path d="M6 8v8M8 6h8a4 4 0 0 1 0 8h-2" strokeLinecap="round" />
        </svg>
      )
    },
    {
      id: 'outline',
      title: 'Outline (Ctrl+Shift+L)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 7h2M9 7h11M4 12h2M9 12h11M4 17h2M9 17h11" />
        </svg>
      )
    },
    {
      id: 'extensions',
      title: 'Extensions (Ctrl+Shift+X)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M14 3h7v7M21 3l-8 8M3 14v7h7M3 21l8-8" />
        </svg>
      )
    }
  ]

  return (
    <div className="activity-bar">
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          className={`ab-btn ${mode === it.id ? 'active' : ''}`}
          title={it.title}
          onClick={() => onChange(mode === it.id ? null : it.id)}
        >
          {it.icon}
          <span className={`ab-indicator ${mode === it.id ? 'on' : ''}`} />
        </button>
      ))}
    </div>
  )
}
