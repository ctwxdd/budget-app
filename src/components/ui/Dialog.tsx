import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  mobileBottomSheet?: boolean
}

const SWIPE_CLOSE_RATIO = 0.25
const SWIPE_CLOSE_VELOCITY = 0.55

export function Dialog({ open, onOpenChange, title, description, children, footer, className, mobileBottomSheet }: DialogProps) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const dragStart = React.useRef<{ y: number; t: number } | null>(null)
  const touchStart = React.useRef<{ x: number; y: number; lastY: number; t: number; scrollable: boolean } | null>(null)
  const dragYRef = React.useRef(0)
  const [dragY, setDragY] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onOpenChange(false)
    const scrollY = window.scrollY
    const bodyStyle = document.body.style
    const original = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
    }
    document.body.style.overflow = 'hidden'
    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${scrollY}px`
    bodyStyle.left = '0'
    bodyStyle.right = '0'
    bodyStyle.width = '100%'
    document.documentElement.dataset.dialogOpen = 'true'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      bodyStyle.overflow = original.overflow
      bodyStyle.position = original.position
      bodyStyle.top = original.top
      bodyStyle.left = original.left
      bodyStyle.right = original.right
      bodyStyle.width = original.width
      delete document.documentElement.dataset.dialogOpen
      window.scrollTo(0, scrollY)
    }
  }, [open, onOpenChange])

  React.useEffect(() => { if (open) { dragYRef.current = 0; setDragY(0); setIsDragging(false); dragStart.current = null } }, [open])

  if (!open) return null

  const startDrag = (clientY: number, pointerId: number, target: HTMLElement) => {
    if (!mobileBottomSheet) return
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) return
    dragStart.current = { y: clientY, t: Date.now() }
    setIsDragging(true)
    try { target.setPointerCapture(pointerId) } catch { /* noop */ }
  }

  const isInteractive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button, input, select, textarea, a, [role="combobox"], [role="option"]'))

  const startSheetDrag = (event: React.PointerEvent<HTMLElement>, allowFromScroll = false) => {
    if (event.pointerType !== 'mouse') return
    if (isInteractive(event.target)) return
    if (allowFromScroll && (scrollRef.current?.scrollTop ?? 0) > 0) return
    startDrag(event.clientY, event.pointerId, event.currentTarget)
  }

  const resistedDrag = (delta: number) => delta >= 0 ? delta : -Math.min(30, Math.pow(-delta, 0.72) * 1.45)

  const onPointerMove = (event: React.PointerEvent) => {
    if (!isDragging || !dragStart.current) return
    const delta = event.clientY - dragStart.current.y
    dragYRef.current = resistedDrag(delta)
    setDragY(dragYRef.current)
  }

  const endDrag = (clientY: number) => {
    if (!isDragging || !dragStart.current) return
    const delta = clientY - dragStart.current.y
    const elapsed = Math.max(Date.now() - dragStart.current.t, 1)
    const velocity = delta / elapsed
    const sheetHeight = sheetRef.current?.offsetHeight ?? 600
    dragStart.current = null
    setIsDragging(false)
    if (delta > sheetHeight * SWIPE_CLOSE_RATIO || velocity > SWIPE_CLOSE_VELOCITY) {
      onOpenChange(false)
    } else {
      dragYRef.current = 0
      setDragY(0)
    }
  }

  const onSheetTouchStart = (event: React.TouchEvent) => {
    if (!mobileBottomSheet || event.touches.length !== 1 || window.matchMedia('(min-width: 768px)').matches) return
    if (isInteractive(event.target)) return
    const touch = event.touches[0]
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      lastY: touch.clientY,
      t: Date.now(),
      scrollable: event.target instanceof Element && Boolean(event.target.closest('[data-dialog-scroll]')),
    }
  }

  const onSheetTouchMove = (event: React.TouchEvent) => {
    const start = touchStart.current
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) > Math.abs(deltaY)) return

    const scrollTop = scrollRef.current?.scrollTop ?? 0
    if (start.scrollable && deltaY < 0) return
    if (start.scrollable && scrollTop > 0) {
      start.y = touch.clientY
      start.lastY = touch.clientY
      start.t = Date.now()
      return
    }
    if (!start.scrollable) {
      event.preventDefault()
      start.lastY = touch.clientY
      if (!dragStart.current) {
        dragStart.current = { y: start.y, t: start.t }
        setIsDragging(true)
      }
      dragYRef.current = resistedDrag(deltaY)
      setDragY(dragYRef.current)
      return
    }
    if (deltaY <= 0) return

    event.preventDefault()
    if (!dragStart.current) {
      dragStart.current = { y: start.y, t: start.t }
      setIsDragging(true)
    }
    dragYRef.current = deltaY
    setDragY(deltaY)
    start.lastY = touch.clientY
  }

  const onSheetTouchEnd = () => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || !dragStart.current) return
    endDrag(start.lastY)
  }

  const overlayOpacity = Math.max(0.25, 1 - dragY / 600)

  return createPortal(<div className={cn('fixed inset-0 z-50 flex', mobileBottomSheet ? 'items-end justify-center md:items-center md:p-4' : 'items-center justify-center p-4')}>
    <button
      className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-overlay-in"
      style={isDragging ? { opacity: overlayOpacity, transition: 'none' } : undefined}
      aria-label="Close dialog"
      onClick={() => onOpenChange(false)}
    />
    <div
      ref={sheetRef}
      className={cn(
        'relative z-10 flex w-full flex-col border border-border/60 bg-card text-card-foreground shadow-2xl',
        mobileBottomSheet
          ? 'max-h-[92dvh] rounded-t-[28px] md:max-h-[90vh] md:max-w-2xl md:rounded-3xl'
          : 'max-h-[90vh] max-w-2xl rounded-3xl',
        mobileBottomSheet ? 'animate-sheet-up md:animate-dialog-in' : 'animate-dialog-in',
        className,
      )}
      style={mobileBottomSheet ? { transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : 'transform 420ms cubic-bezier(0.22, 1.3, 0.36, 1)', willChange: 'transform' } : undefined}
      onTouchStart={onSheetTouchStart}
      onTouchMove={onSheetTouchMove}
      onTouchEnd={onSheetTouchEnd}
      onTouchCancel={onSheetTouchEnd}
    >
      {mobileBottomSheet && <div
        className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing md:hidden"
        onPointerDown={(event) => { if (event.pointerType === 'mouse') { event.preventDefault(); startDrag(event.clientY, event.pointerId, event.currentTarget) } }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event.clientY)}
        onPointerCancel={(event) => endDrag(event.clientY)}
      >
        <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
      </div>}
      <div
        className={cn('flex shrink-0 touch-pan-y items-start justify-between gap-4 px-5 md:px-7', mobileBottomSheet ? 'pt-1 md:pt-7' : 'pt-6 md:pt-7')}
        onPointerDown={(event) => startSheetDrag(event)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event.clientY)}
        onPointerCancel={(event) => endDrag(event.clientY)}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)} className="-mr-2 -mt-1 shrink-0"><X className="h-5 w-5" /></Button>
      </div>
      <div
        ref={scrollRef}
        data-dialog-scroll
        className={cn(
          'flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pt-4 md:px-7 md:pt-6',
          mobileBottomSheet ? 'pb-4 md:pb-8' : 'pb-6 md:pb-8',
        )}
        onPointerDown={(event) => startSheetDrag(event, true)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event.clientY)}
        onPointerCancel={(event) => endDrag(event.clientY)}
      >
        {children}
      </div>
      {footer && <div className="shrink-0 border-t border-border/70 bg-card/95 px-5 pb-[max(calc(env(safe-area-inset-bottom)-0.75rem),0.25rem)] pt-2 shadow-[0_-14px_28px_-24px_rgba(31,41,55,0.45)] backdrop-blur-xl md:px-7 md:pb-5 md:pt-4">{footer}</div>}
    </div>
  </div>, document.body)
}
