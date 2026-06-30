import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui'
import { QueryError } from '../components/layout/QueryError'
import { SkeletonCards } from '../components/layout/Skeletons'
import { useCardBenefits } from '../hooks/useCardBenefits'
import { useCards } from '../hooks/useCards'
import { useExpenses } from '../hooks/useExpenses'
import { calculateBenefitUsage, expandCardBenefitsForCards, type BenefitUsage } from '../lib/cardBenefits'
import { currency } from '../lib/format'

export function BenefitTrackerPage() {
  const { data = [], isLoading, error, refetch } = useExpenses()
  const cardBenefits = useCardBenefits()
  const cardsQuery = useCards()
  const activeCards = React.useMemo(() => cardsQuery.cards.filter((card) => card.active), [cardsQuery.cards])
  const effectiveBenefits = React.useMemo(() => expandCardBenefitsForCards(cardBenefits.benefits, activeCards), [cardBenefits.benefits, activeCards])
  const benefitUsages = React.useMemo(() => effectiveBenefits
    .map((benefit) => calculateBenefitUsage(benefit, data))
    .filter((usage): usage is BenefitUsage => Boolean(usage))
    .sort((a, b) => a.end.localeCompare(b.end) || b.remaining - a.remaining || a.benefit.card.localeCompare(b.benefit.card)),
  [effectiveBenefits, data])

  if (isLoading || cardsQuery.isLoading || cardBenefits.isLoading) return <SkeletonCards />
  if (error) return <QueryError error={error} onRetry={() => { void refetch() }} />

  return <div className="space-y-5 md:space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Benefit tracker</CardTitle>
        <CardDescription>Track each credit first, then see every active card using it.</CardDescription>
      </CardHeader>
      <CardContent><BenefitProgressList usages={benefitUsages} tabMissing={cardBenefits.tabMissing} /></CardContent>
    </Card>
  </div>
}

function EmptyBenefits() {
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">No active benefits to track yet.</div>
}

function BenefitProgressList({ usages, tabMissing }: { usages: BenefitUsage[]; tabMissing: boolean }) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  if (tabMissing) return <div className="rounded-3xl border border-dashed bg-butter/10 p-5 text-sm">
    <p className="font-extrabold">Add a CardBenefits tab to track card credits here.</p>
    <p className="mt-1 text-muted-foreground">Columns: Product, Benefit, Amount, Period, Category, Merchant/Tag, Start Date, End Date, Active.</p>
  </div>
  if (!usages.length) return <EmptyBenefits />
  const totalLeft = usages.reduce((sum, usage) => sum + usage.remaining, 0)
  const totalUsed = usages.reduce((sum, usage) => sum + usage.used, 0)
  const groups = Array.from(usages.reduce((map, usage) => {
    const key = usage.benefit.benefit || 'Benefit'
    map.set(key, [...(map.get(key) || []), usage])
    return map
  }, new Map<string, BenefitUsage[]>()).entries())
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.benefit.card.localeCompare(b.benefit.card)),
      used: items.reduce((sum, usage) => sum + usage.used, 0),
      left: items.reduce((sum, usage) => sum + usage.remaining, 0),
      amount: items.reduce((sum, usage) => sum + usage.benefit.amount, 0),
    }))
    .sort((a, b) => b.left - a.left || a.name.localeCompare(b.name))
  const toggleGroup = (name: string) => setCollapsed((current) => {
    const next = new Set(current)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <BenefitKpi label="Benefits tracked" value={String(groups.length)} />
      <BenefitKpi label="Used this period" value={currency.format(totalUsed)} />
      <BenefitKpi label="Left this period" value={currency.format(totalLeft)} />
    </div>
    <div className="space-y-3">
      {groups.map((group) => {
        const groupPct = group.amount > 0 ? Math.min(100, Math.round((group.used / group.amount) * 100)) : 0
        const isCollapsed = collapsed.has(group.name)
        return <div key={group.name} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          <button type="button" className={`block w-full border-border/60 bg-accent/25 px-3 py-2.5 text-left transition hover:bg-accent/40 sm:px-4 ${isCollapsed ? '' : 'border-b'}`} onClick={() => toggleGroup(group.name)} aria-expanded={!isCollapsed}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{group.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{group.items.length} card{group.items.length === 1 ? '' : 's'} · {currency.format(group.left)} left</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-xs font-extrabold tabular-nums text-muted-foreground">{currency.format(group.used)} / {currency.format(group.amount)}</p>
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{isCollapsed ? 'Show' : 'Hide'}</span>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${groupPct}%` }} />
            </div>
          </button>
          {!isCollapsed && <div>
            {group.items.map((usage) => {
              const pct = usage.benefit.amount > 0 ? Math.min(100, Math.round((usage.used / usage.benefit.amount) * 100)) : 0
              const done = usage.remaining <= 0.005
              return <div key={`${usage.benefit.rowIndex}-${usage.benefit.card}`} className="grid gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(10rem,0.8fr)] sm:items-center sm:px-4">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-extrabold">{usage.benefit.card}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${done ? 'bg-mint/15 text-emerald-700 dark:text-mint' : 'bg-butter/25 text-amber-700 dark:text-butter'}`}>{done ? 'Done' : `${currency.format(usage.remaining)} left`}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span className="tabular-nums">{currency.format(usage.used)} / {currency.format(usage.benefit.amount)}</span>
                    <span className="tabular-nums">{usage.count} match{usage.count === 1 ? '' : 'es'}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{usage.start} {'->'} {usage.end}</p>
                </div>
              </div>
            })}
          </div>}
        </div>
      })}
    </div>
  </div>
}

function BenefitKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border/70 bg-accent/35 p-3">
    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-0.5 truncate font-display text-base font-extrabold tabular-nums sm:text-lg">{value}</p>
  </div>
}
