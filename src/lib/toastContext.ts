import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'info' | 'error'
export type Toast = { id: number; message: string; kind: ToastKind }

export const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null)

// Brief confirmation for an action: saved, downloaded, refunded.
export function useToast() {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>')
  return toast
}
