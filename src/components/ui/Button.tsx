import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.97]', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] ring-1 ring-primary/20 hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.99]',
      gradient: 'bg-gradient-to-r from-primary to-coral text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.65)] ring-1 ring-white/20 hover:scale-[1.02] active:scale-[0.99]',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-border bg-white/80 text-foreground shadow-sm hover:bg-accent/70 dark:bg-card',
      ghost: 'text-muted-foreground hover:bg-accent/80 hover:text-accent-foreground',
      destructive: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
    },
    size: { default: 'h-11 px-4 py-2', sm: 'h-9 px-3 text-xs', lg: 'h-12 px-6 text-base', icon: 'h-11 w-11' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />)
Button.displayName = 'Button'
