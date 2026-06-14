import * as React from 'react'
import { cn } from '../../lib/utils'

export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string; content: React.ReactNode }[]; value: string; onChange: (value: string) => void }) {
  const active = tabs.find((tab) => tab.value === value) ?? tabs[0]
  return <div><div className="mb-5 flex gap-2 overflow-x-auto rounded-full border bg-white/70 p-1 shadow-sm dark:bg-card/70 md:flex-wrap"><div className="flex min-w-max gap-2 md:min-w-0 md:flex-wrap">{tabs.map((tab) => <button key={tab.value} onClick={() => onChange(tab.value)} className={cn('h-11 flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap', value === tab.value ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>{tab.label}</button>)}</div></div>{active?.content}</div>
}
