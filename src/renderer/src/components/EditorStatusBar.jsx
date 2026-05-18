import { useEffect, useRef, useState } from 'react'

// Slim status strip at the bottom of the editor area showing live git info
// (branch, ahead/behind, modified count) and the active file path.
export default function EditorStatusBar({ projectPath, activeFile }) {
  const [status, setStatus] = useState(null)
  const pollRef = useRef(null)

  async function refresh() {
    try {
      const r = await window.nexterm.gitc.status(projectPath)
      if (r?.ok) setStatus(r)
    } catch {}
  }

  useEffect(() => {
    refresh()
    pollRef.current = setInterval(refresh, 6000)
    return () => clearInterval(pollRef.current)
  }, [projectPath])

  if (!status) return null
  const modifiedCount = (status.files || []).length
  const rel = activeFile && activeFile.startsWith(projectPath)
    ? activeFile.slice(projectPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
    : ''

  return (
    <div className="editor-statusbar">
      {status.isRepo ? (
        <>
          <span className="esb-item esb-branch" title={status.headHash ? `HEAD ${status.headHash}` : ''}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="4" cy="3" r="1.4" />
              <circle cx="4" cy="13" r="1.4" />
              <circle cx="12" cy="8" r="1.4" />
              <path d="M4 5v6M5.5 3.6h4.5a2.5 2.5 0 0 1 0 5h-3" strokeLinecap="round" />
            </svg>
            {status.branch || '(detached)'}
          </span>
          {status.ahead > 0  && <span className="esb-item esb-ahead">↑{status.ahead}</span>}
          {status.behind > 0 && <span className="esb-item esb-behind">↓{status.behind}</span>}
          {modifiedCount > 0 && (
            <span className="esb-item esb-modified" title={`${modifiedCount} modified file${modifiedCount === 1 ? '' : 's'}`}>
              ● {modifiedCount}
            </span>
          )}
        </>
      ) : (
        <span className="esb-item esb-norepo">Not a git repository</span>
      )}
      <span style={{ flex: 1 }} />
      {rel && <span className="esb-item esb-file" title={activeFile}>{rel}</span>}
    </div>
  )
}
