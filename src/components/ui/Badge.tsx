import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors', { variants: { variant: { default: 'border-transparent bg-coral/10 text-coral', secondary: 'border-transparent bg-lavender/15 text-foreground', outline: 'border-border bg-white/70 text-foreground dark:bg-card', success: 'border-transparent bg-mint/15 text-emerald-700 dark:text-mint', warning: 'border-transparent bg-butter/25 text-amber-700 dark:text-butter' } }, defaultVariants: { variant: 'default' } })
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) { return <div className={cn(badgeVariants({ variant }), className)} {...props} /> }
