import * as React from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Input, Select, Textarea, useToast } from '../components/ui'
import { QueryError } from '../components/layout/QueryError'
import { SkeletonCards } from '../components/layout/Skeletons'
import { useAddBenefitCredit, useBenefitCredits, useCreateBenefitCreditsTab, useUpdateBenefitCredit } from '../hooks/useBenefitCredits'
import { useCardBenefits } from '../hooks/useCardBenefits'
import { useCards } from '../hooks/useCards'
import { useExpenses } from '../hooks/useExpenses'
import { applyBenefitCredits, calculateBenefitUsage, expandCardBenefitsForCards, type BenefitUsage, type CardBenefitCredit } from '../lib/cardBenefits'
import { currency } from '../lib/format'

export function BenefitTrackerPage() {
  const { data = [], isLoading, error, refetch } = useExpenses()
  const cardBenefits = useCardBenefits()
  const benefitCredits = useBenefitCredits()
  const createCreditsTab = useCreateBenefitCreditsTab()
  const cardsQuery = useCards()
  const activeCards = React.useMemo(() => cardsQuery.cards.filter((card) => card.active), [cardsQuery.cards])
  const effectiveBenefits = React.useMemo(() => expandCardBenefitsForCards(cardBenefits.benefits, activeCards), [cardBenefits.benefits, activeCards])
  const benefitUsages = React.useMemo(() => effectiveBenefits
    .map((benefit) => calculateBenefitUsage(benefit, data))
    .filter((usage): usage is BenefitUsage => Boolean(usage))
    .map((usage) => applyBenefitCredits(usage, benefitCredits.credits))
    .sort((a, b) => a.end.localeCompare(b.end) || b.remaining - a.remaining || a.benefit.card.localeCompare(b.benefit.card)),
  [effectiveBenefits, data, benefitCredits.credits])
  const [creditUsage, setCreditUsage] = React.useState<BenefitUsage | null>(null)
  const [creditRow, setCreditRow] = React.useState<CardBenefitCredit | null>(null)
  const loadError = error || cardsQuery.error || cardBenefits.error || benefitCredits.error

  if (isLoading || cardsQuery.isLoading || cardBenefits.isLoading || benefitCredits.isLoading) return <SkeletonCards />
  if (loadError) return <QueryError error={loadError} onRetry={() => { void refetch() }} />

  return <div className="space-y-5 md:space-y-6">
    {benefitCredits.tabMissing && <Card className="border-dashed bg-butter/10">
      <CardContent className="flex flex-col gap-3 pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-extrabold">Add a BenefitCredits tab for manual credit tracking.</p><p className="mt-1 text-muted-foreground">Columns: Date, Card, Benefit, Amount, Status, Note.</p></div>
        <Button onClick={() => createCreditsTab.mutate()} disabled={createCreditsTab.isPending}>{createCreditsTab.isPending ? 'Creating...' : 'Create tab'}</Button>
      </CardContent>
    </Card>}
    <Card>
      <CardHeader>
        <CardTitle>Benefit tracker</CardTitle>
        <CardDescription>Track each credit first, then see every active card using it.</CardDescription>
      </CardHeader>
      <CardContent><BenefitProgressList usages={benefitUsages} tabMissing={cardBenefits.tabMissing} creditsDisabled={benefitCredits.tabMissing} onEditCredit={(usage, credit) => { setCreditUsage(usage); setCreditRow(credit || null) }} /></CardContent>
    </Card>
    {creditUsage && <BenefitCreditDialog open usage={creditUsage} credit={creditRow} onOpenChange={(open) => { if (!open) { setCreditUsage(null); setCreditRow(null) } }} />}
  </div>
}

function EmptyBenefits() {
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">No active benefits to track yet.</div>
}

function BenefitProgressList({ usages, tabMissing, creditsDisabled, onEditCredit }: { usages: BenefitUsage[]; tabMissing: boolean; creditsDisabled: boolean; onEditCredit: (usage: BenefitUsage, credit?: CardBenefitCredit) => void }) {
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
              const credit = usage.creditRows?.[0]
              const creditLabel = usage.creditAmount ? `Received ${currency.format(usage.creditAmount)}` : usage.pendingCreditAmount ? `Pending ${currency.format(usage.pendingCreditAmount)}` : ''
              return <div key={`${usage.benefit.rowIndex}-${usage.benefit.card}`} className="grid gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(10rem,0.8fr)_auto] sm:items-center sm:px-4">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-extrabold">{usage.benefit.card}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${done ? 'bg-mint/15 text-emerald-700 dark:text-mint' : 'bg-butter/25 text-amber-700 dark:text-butter'}`}>{done ? 'Done' : `${currency.format(usage.remaining)} left`}</span>
                  </div>
                  {creditLabel && <p className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700 dark:text-mint">{creditLabel}</p>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span className="tabular-nums">{currency.format(usage.used)} / {currency.format(usage.benefit.amount)}</span>
                    <span className="tabular-nums">{usage.creditCount ? `${usage.creditCount} credit${usage.creditCount === 1 ? '' : 's'}` : `${usage.count} match${usage.count === 1 ? '' : 'es'}`}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{usage.start} {'->'} {usage.end}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" className="h-8 justify-center rounded-full px-3 text-xs sm:w-auto" disabled={creditsDisabled} onClick={() => onEditCredit(usage, credit)}>
                  {credit ? 'Edit' : 'Mark credit'}
                </Button>
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

function todayIso() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function defaultCreditDate(usage: BenefitUsage) {
  const today = todayIso()
  if (today >= usage.start && today <= usage.end) return today
  return usage.end
}

function BenefitCreditDialog({ open, onOpenChange, usage, credit }: { open: boolean; onOpenChange: (open: boolean) => void; usage: BenefitUsage; credit: CardBenefitCredit | null }) {
  const addCredit = useAddBenefitCredit()
  const updateCredit = useUpdateBenefitCredit()
  const { toast } = useToast()
  const [form, setForm] = React.useState(() => ({
    date: credit?.date || defaultCreditDate(usage),
    amount: credit?.amount || Math.max(0, usage.remaining || usage.benefit.amount),
    status: credit?.status === 'pending' ? 'Pending' : 'Received',
    note: credit?.note || '',
  }))

  React.useEffect(() => {
    if (!open) return
    setForm({
      date: credit?.date || defaultCreditDate(usage),
      amount: credit?.amount || Math.max(0, usage.remaining || usage.benefit.amount),
      status: credit?.status === 'pending' ? 'Pending' : 'Received',
      note: credit?.note || '',
    })
  }, [open, usage, credit])

  const saving = addCredit.isPending || updateCredit.isPending
  const formId = 'benefit-credit-form'
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload = {
      date: form.date,
      card: usage.benefit.card,
      benefit: usage.benefit.benefit,
      amount: form.amount,
      status: form.status,
      note: form.note.trim(),
    }
    if (!payload.date || payload.amount <= 0) return toast({ title: 'Date and amount are required.', variant: 'destructive' })
    try {
      if (credit) await updateCredit.mutateAsync({ rowIndex: credit.rowIndex, credit: payload })
      else await addCredit.mutateAsync(payload)
      toast({ title: credit ? 'Benefit credit updated' : 'Benefit credit added' })
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Could not save benefit credit', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title={credit ? 'Edit benefit credit' : 'Mark benefit credit'} description={`${usage.benefit.card} · ${usage.benefit.benefit}`} mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form={formId} disabled={saving}>{saving ? 'Saving...' : 'Save credit'}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Date<Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Amount<Input inputMode="decimal" type="number" min="0" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value === '' ? 0 : Number(event.target.value) })} /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Status<Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Received</option><option>Pending</option></Select></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Note<Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Booking, statement credit, confirmation..." /></label>
    </form>
  </Dialog>
}
