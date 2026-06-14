import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  mobileBottomSheet?: boolean
}

export function Dialog({ open, onOpenChange, title, description, children, className, mobileBottomSheet }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onOpenChange(false)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = originalOverflow }
  }, [open, onOpenChange])
  if (!open) return null
  return <div className={cn('fixed inset-0 z-50 flex p-4', mobileBottomSheet ? 'items-end justify-center p-0 md:items-center md:p-4' : 'items-center justify-center')}>
    <button className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" aria-label="Close dialog" onClick={() => onOpenChange(false)} />
    <div className={cn('relative z-10 w-full overflow-hidden border bg-card shadow-2xl transition-all duration-200', mobileBottomSheet ? 'max-h-[92vh] rounded-b-none rounded-t-3xl md:max-h-[90vh] md:max-w-2xl md:rounded-3xl' : 'max-h-[90vh] max-w-2xl rounded-3xl', className)}>
      <div className="h-2 bg-gradient-to-r from-coral via-peach to-butter" />
      <div className={cn('overflow-y-auto p-5 pb-6 md:p-7 md:pb-8', mobileBottomSheet ? 'max-h-[calc(92vh-0.5rem)] md:max-h-[calc(90vh-0.5rem)]' : 'max-h-[calc(90vh-0.5rem)]')}>
        {mobileBottomSheet && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted md:hidden" />}
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-bold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div><Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button></div>
        {children}
      </div>
    </div>
  </div>
}
