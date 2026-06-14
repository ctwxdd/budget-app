import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

export function DropdownMenu({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return <div className="relative inline-block text-left"><Button type="button" variant="outline" onClick={() => setOpen((v) => !v)}>{label}<ChevronDown className="h-4 w-4" /></Button>{open && <div className="absolute right-0 z-30 mt-2 min-w-48 rounded-lg border bg-card p-1 shadow-lg" onClick={() => setOpen(false)}>{children}</div>}</div>
}

export function DropdownMenuItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent', className)} {...props} /> }
