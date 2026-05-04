import { useRef } from 'react'
import { useStore } from '../store'
import Terminal from './Terminal'
import ScratchPane from './ScratchPane'

export default function PaneSplitter({ pane, tabId, tabActive, activePaneId }) {
  if (pane.kind === 'leaf') {
    if (pane.scratch) {
      return (
        <ScratchPane
          pane={pane}
          tabId={tabId}
          active={tabActive && pane.id === activePaneId}
        />
      )
    }
    return (
      <Terminal
        pane={pane}
        tabId={tabId}
        active={tabActive && pane.id === activePaneId}
      />
    )
  }
  return <Split pane={pane} tabId={tabId} tabActive={tabActive} activePaneId={activePaneId} />
}

function Split({ pane, tabId, tabActive, activePaneId }) {
  const setSplitRatio = useStore(s => s.setSplitRatio)
  const wrapRef = useRef(null)

  const isRow = pane.dir === 'row'

  function startDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    const rect = wrapRef.current.getBoundingClientRect()
    const total = isRow ? rect.width : rect.height
    const startPos = isRow ? e.clientX : e.clientY
    const startOff = isRow ? rect.left : rect.top
    const startRatio = pane.ratio

    function move(ev) {
      const cur = isRow ? ev.clientX : ev.clientY
      const delta = cur - startPos
      const newRatio = Math.max(0.08, Math.min(0.92, startRatio + delta / total))
      setSplitRatio(tabId, pane.id, newRatio)
    }
    function up() {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div ref={wrapRef} className={`split split-${pane.dir}`}>
      <div className="split-child" style={{ flex: pane.ratio }}>
        <PaneSplitter
          pane={pane.a}
          tabId={tabId}
          tabActive={tabActive}
          activePaneId={activePaneId}
        />
      </div>
      <div
        className={`split-divider divider-${pane.dir}`}
        onMouseDown={startDrag}
      />
      <div className="split-child" style={{ flex: 1 - pane.ratio }}>
        <PaneSplitter
          pane={pane.b}
          tabId={tabId}
          tabActive={tabActive}
          activePaneId={activePaneId}
        />
      </div>
    </div>
  )
}
