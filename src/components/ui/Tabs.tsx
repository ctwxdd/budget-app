import * as React from 'react'
import { cn } from '../../lib/utils'

export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string; content: React.ReactNode }[]; value: string; onChange: (value: string) => void }) {
  const active = tabs.find((tab) => tab.value === value) ?? tabs[0]
  return <div><div className="mb-5 rounded-3xl border bg-white/70 p-1 shadow-sm dark:bg-card/70"><div className="grid grid-cols-2 gap-1 md:flex md:flex-wrap">{tabs.map((tab) => <button key={tab.value} onClick={() => onChange(tab.value)} className={cn('min-h-11 min-w-0 rounded-full px-3 py-2 text-xs font-semibold leading-tight transition sm:text-sm md:px-4 whitespace-normal md:whitespace-nowrap', value === tab.value ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>{tab.label}</button>)}</div></div>{active?.content}</div>
}
