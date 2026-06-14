import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; title: string; description?: string; variant?: 'default' | 'destructive'; action?: ToastAction; duration?: number }
type ToastContextValue = { toast: (toast: Omit<Toast, 'id'>) => void }
const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const dismiss = React.useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), [])
  const toast = React.useCallback((next: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, ...next }])
    const duration = next.duration ?? 4000
    if (duration > 0) window.setTimeout(() => dismiss(id), duration)
  }, [dismiss])
  return <ToastContext.Provider value={{ toast }}>{children}<div className="pointer-events-none fixed z-[60] flex flex-col gap-2 inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:right-4 md:top-[calc(env(safe-area-inset-top)+1rem)] md:w-80 md:max-w-[calc(100vw-2rem)]">{toasts.map((item) => <div key={item.id} className={cn('pointer-events-auto rounded-2xl border border-border bg-card/95 p-3 text-sm shadow-lift backdrop-blur-xl animate-toast-pop md:p-4', item.variant === 'destructive' && 'border-destructive/50')}><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-semibold leading-tight">{item.title}</p>{item.description && <p className="mt-1 truncate text-muted-foreground">{item.description}</p>}{item.action && <button type="button" onClick={() => { item.action!.onClick(); dismiss(item.id) }} className="mt-2 inline-flex items-center rounded-full bg-coral/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-coral motion-safe:active:scale-95">{item.action.label}</button>}</div><button aria-label="Dismiss" onClick={() => dismiss(item.id)} className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-accent/70"><X className="h-4 w-4" /></button></div></div>)}</div></ToastContext.Provider>
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
