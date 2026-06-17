import * as React from 'react'
import { cn } from '../../lib/utils'

const variants = {
  default: 'border-transparent bg-coral/10 text-coral',
  secondary: 'border-transparent bg-lavender/15 text-foreground',
  outline: 'border-border bg-white/70 text-foreground dark:bg-card',
  success: 'border-transparent bg-mint/15 text-emerald-700 dark:text-mint',
  warning: 'border-transparent bg-butter/25 text-amber-700 dark:text-butter',
} as const
export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof variants }) { return <div className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors', variants[variant], className)} {...props} /> }
