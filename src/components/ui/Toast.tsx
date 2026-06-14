import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

type Toast = { id: number; title: string; description?: string; variant?: 'default' | 'destructive' }
type ToastContextValue = { toast: (toast: Omit<Toast, 'id'>) => void }
const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const toast = React.useCallback((next: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, ...next }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4000)
  }, [])
  return <ToastContext.Provider value={{ toast }}>{children}<div className="fixed right-4 top-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">{toasts.map((item) => <div key={item.id} className={cn('rounded-3xl border bg-card p-4 text-sm shadow-lift', item.variant === 'destructive' && 'border-destructive/50')}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p>{item.description && <p className="mt-1 text-muted-foreground">{item.description}</p>}</div><button onClick={() => setToasts((items) => items.filter((toastItem) => toastItem.id !== item.id))}><X className="h-4 w-4" /></button></div></div>)}</div></ToastContext.Provider>
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
