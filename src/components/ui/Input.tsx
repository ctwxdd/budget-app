import * as React from 'react'
import { cn } from '../../lib/utils'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  clearable?: boolean
}

function setRefs<T>(refs: Array<React.ForwardedRef<T> | React.MutableRefObject<T | null>>, value: T | null) {
  refs.forEach((ref) => {
    if (typeof ref === 'function') ref(value)
    else if (ref) ref.current = value
  })
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, clearable = true, value, defaultValue, disabled, readOnly, onChange, type, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement | null>(null)
  const valueText = value ?? defaultValue ?? ''
  const hasValue = String(valueText).length > 0
  const canClear = clearable && hasValue && !disabled && !readOnly && type !== 'hidden' && type !== 'file'
  const reserveRightSpace = canClear && !String(className || '').match(/\bpr-\d/)
  const clearRight = props.role === 'combobox' && String(className || '').includes('pr-12') ? 'right-9' : 'right-1.5'
  const clear = () => {
    const input = innerRef.current
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
  }
  return <span className={cn('relative block min-w-0 max-w-full w-full', String(className || '').includes('flex-1') && 'flex-1')}>
    <input
      ref={(node) => { innerRef.current = node; setRefs([ref], node) }}
      type={type}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      readOnly={readOnly}
      onChange={onChange}
      className={cn('block h-11 min-w-0 max-w-full w-full rounded-full border border-input bg-white/80 px-4 py-2 text-base shadow-sm ring-offset-background file:border-0 file:bg-transparent placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card sm:text-sm', reserveRightSpace && 'pr-10', className)}
      {...props}
    />
    {canClear && <button
      type="button"
      aria-label="Clear input"
      className={cn('absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-95', clearRight)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={clear}
    >
      <span aria-hidden="true" className="text-lg leading-none">×</span>
    </button>}
  </span>
})
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn('min-h-20 w-full rounded-3xl border border-input bg-white/80 px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card', className)} {...props} />)
Textarea.displayName = 'Textarea'
