import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type Toast, type ToastKind } from '../lib/toastContext.ts'

const DURATION_MS = 3500
const MAX_VISIBLE = 3

const ICONS: Record<ToastKind, string> = { success: '✓', info: 'i', error: '!' }

// Toasts stack bottom-centre and announce politely to screen readers.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, kind }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-icon" aria-hidden="true">
              {ICONS[t.kind]}
            </span>
            <span className="toast-text">{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
