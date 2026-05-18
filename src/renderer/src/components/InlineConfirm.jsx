import { useEffect, useRef } from 'react'

// Lightweight in-app confirm dialog. Lives as a small centered card with a
// dim backdrop — the project window stays visible behind it so the user
// keeps their context.
//
// Usage: render <InlineConfirm message="..." detail="..." danger onConfirm onCancel />
export default function InlineConfirm({
  message,
  detail,
  confirmLabel = 'OK',
  cancelLabel  = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}) {
  const okRef = useRef(null)

  useEffect(() => {
    okRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onCancel?.()
      if (e.key === 'Enter')  onConfirm?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="inline-confirm-backdrop" onMouseDown={onCancel}>
      <div className="inline-confirm-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="inline-confirm-msg">{message}</div>
        {detail && <div className="inline-confirm-detail">{detail}</div>}
        <div className="inline-confirm-actions">
          <button className="inline-confirm-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={okRef}
            className={`inline-confirm-ok ${danger ? 'danger' : ''}`}
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
