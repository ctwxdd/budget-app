import * as React from 'react'
import { cn } from '../../lib/utils'

type FadeScrollProps = React.HTMLAttributes<HTMLDivElement> & {
  outerClassName?: string
  fadeSize?: number
  fadeFrom?: string
  fadeTo?: string
}

export const FadeScroll = React.forwardRef<HTMLDivElement, FadeScrollProps>(function FadeScroll(
  { outerClassName, className, fadeSize = 20, fadeFrom = 'hsl(var(--card))', fadeTo = 'hsl(var(--card) / 0)', children, ...rest },
  ref,
) {
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement, [])
  const [topFaded, setTopFaded] = React.useState(false)
  const [bottomFaded, setBottomFaded] = React.useState(false)

  const update = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    const canScroll = el.scrollHeight - el.clientHeight > 1
    setTopFaded(canScroll && el.scrollTop > 1)
    setBottomFaded(canScroll && el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }, [])

  React.useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    Array.from(el.children).forEach((child) => ro.observe(child))
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [update, children])

  return (
    <div className={cn('relative overflow-hidden', outerClassName)}>
      <div ref={innerRef} className={className} {...rest}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-150', topFaded ? 'opacity-100' : 'opacity-0')}
        style={{ height: fadeSize, background: `linear-gradient(to bottom, ${fadeFrom} 0%, ${fadeTo} 100%)` }}
      />
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-150', bottomFaded ? 'opacity-100' : 'opacity-0')}
        style={{ height: fadeSize, background: `linear-gradient(to top, ${fadeFrom} 0%, ${fadeTo} 100%)` }}
      />
    </div>
  )
})
