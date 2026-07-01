import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { BenefitDialog } from '../components/benefits/BenefitDialog'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Dialog, Input, Select, Textarea, useToast } from '../components/ui'
import { QueryError } from '../components/layout/QueryError'
import { SkeletonCards } from '../components/layout/Skeletons'
import { useAddBenefitCredit, useBenefitCredits, useCreateBenefitCreditsTab, useUpdateBenefitCredit } from '../hooks/useBenefitCredits'
import { useCardBenefits, useDeleteCardBenefit } from '../hooks/useCardBenefits'
import { useCards } from '../hooks/useCards'
import { useExpenses } from '../hooks/useExpenses'
import { applyBenefitCredits, calculateBenefitUsage, expandCardBenefitsForCards, type BenefitUsage, type CardBenefit, type CardBenefitCredit } from '../lib/cardBenefits'
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
  const [benefitDialogOpen, setBenefitDialogOpen] = React.useState(false)
  const [editingBenefit, setEditingBenefit] = React.useState<CardBenefit | null>(null)
  const productNames = React.useMemo(() => cardsQuery.cards.filter((card) => card.active && card.name).map((card) => card.name).reverse(), [cardsQuery.cards])
  const benefitByRow = React.useMemo(() => new Map(cardBenefits.benefits.map((benefit) => [benefit.rowIndex, benefit])), [cardBenefits.benefits])
  const editBenefit = React.useCallback((benefit: CardBenefit) => {
    setEditingBenefit(benefitByRow.get(benefit.rowIndex) || benefit)
    setBenefitDialogOpen(true)
  }, [benefitByRow])
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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Benefit tracker</CardTitle>
          <CardDescription>Track each credit first, then see every active card using it.</CardDescription>
        </div>
        {!cardBenefits.tabMissing && <Button type="button" size="sm" onClick={() => { setEditingBenefit(null); setBenefitDialogOpen(true) }} className="rounded-full"><Plus className="h-4 w-4" />Add benefit</Button>}
      </CardHeader>
      <CardContent><BenefitProgressList usages={benefitUsages} benefitByRow={benefitByRow} tabMissing={cardBenefits.tabMissing} creditsDisabled={benefitCredits.tabMissing} onAddBenefit={() => { setEditingBenefit(null); setBenefitDialogOpen(true) }} onEditBenefit={editBenefit} onEditCredit={(usage, credit) => { setCreditUsage(usage); setCreditRow(credit || null) }} /></CardContent>
    </Card>
    <BenefitDialog open={benefitDialogOpen} onOpenChange={(open) => { setBenefitDialogOpen(open); if (!open) setEditingBenefit(null) }} benefit={editingBenefit} productName={editingBenefit?.card || ''} productOptions={productNames} />
    {creditUsage && <BenefitCreditDialog open usage={creditUsage} credit={creditRow} onOpenChange={(open) => { if (!open) { setCreditUsage(null); setCreditRow(null) } }} />}
  </div>
}

function EmptyBenefits({ onAddBenefit }: { onAddBenefit: () => void }) {
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">
    <div>
      <p>No active benefits to track yet.</p>
      <Button type="button" size="sm" className="mt-3 rounded-full" onClick={onAddBenefit}><Plus className="h-4 w-4" />Add benefit</Button>
    </div>
  </div>
}

function BenefitProgressList({ usages, benefitByRow, tabMissing, creditsDisabled, onAddBenefit, onEditBenefit, onEditCredit }: { usages: BenefitUsage[]; benefitByRow: Map<number, CardBenefit>; tabMissing: boolean; creditsDisabled: boolean; onAddBenefit: () => void; onEditBenefit: (benefit: CardBenefit) => void; onEditCredit: (usage: BenefitUsage, credit?: CardBenefitCredit) => void }) {
  const deleteBenefit = useDeleteCardBenefit()
  const [confirmBenefit, setConfirmBenefit] = React.useState<CardBenefit | null>(null)
  const [view, setView] = React.useState<'benefit' | 'card'>('benefit')
  const [collapsed, setCollapsed] = React.useState<Set<string> | null>(null)
  const [cardSearch, setCardSearch] = React.useState('')
  const visibleUsages = React.useMemo(() => {
    const query = cardSearch.trim().toLocaleLowerCase()
    if (!query) return usages
    return usages.filter((usage) => {
      const template = benefitByRow.get(usage.benefit.rowIndex)
      return [
        usage.benefit.card,
        usage.benefit.benefit,
        template?.card,
        template?.benefit,
      ].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(query))
    })
  }, [usages, benefitByRow, cardSearch])
  if (tabMissing) return <div className="rounded-3xl border border-dashed bg-butter/10 p-5 text-sm">
    <p className="font-extrabold">Add a CardBenefits tab to track card credits here.</p>
    <p className="mt-1 text-muted-foreground">Columns: Product, Benefit, Amount, Period, Category, Merchant/Tag, Start Date, End Date, Active.</p>
  </div>
  if (!usages.length) return <EmptyBenefits onAddBenefit={onAddBenefit} />
  const totalLeft = visibleUsages.reduce((sum, usage) => sum + usage.remaining, 0)
  const totalUsed = visibleUsages.reduce((sum, usage) => sum + usage.used, 0)
  const groups = Array.from(visibleUsages.reduce((map, usage) => {
    const template = benefitByRow.get(usage.benefit.rowIndex) || usage.benefit
    const key = `${template.card}||${template.benefit || 'Benefit'}`
    map.set(key, [...(map.get(key) || []), usage])
    return map
  }, new Map<string, BenefitUsage[]>()).entries())
    .map(([key, items]) => ({
      key,
      name: (items[0] && (benefitByRow.get(items[0].benefit.rowIndex)?.benefit || items[0].benefit.benefit)) || 'Benefit',
      product: (items[0] && (benefitByRow.get(items[0].benefit.rowIndex)?.card || items[0].benefit.card)) || '',
      items: items.sort((a, b) => a.benefit.card.localeCompare(b.benefit.card)),
      benefit: items[0] ? benefitByRow.get(items[0].benefit.rowIndex) || items[0].benefit : undefined,
      used: items.reduce((sum, usage) => sum + usage.used, 0),
      left: items.reduce((sum, usage) => sum + usage.remaining, 0),
      amount: items.reduce((sum, usage) => sum + usage.benefit.amount, 0),
    }))
    .sort((a, b) => b.left - a.left || a.product.localeCompare(b.product) || a.name.localeCompare(b.name))
  const cardGroups = Array.from(visibleUsages.reduce((map, usage) => {
    map.set(usage.benefit.card, [...(map.get(usage.benefit.card) || []), usage])
    return map
  }, new Map<string, BenefitUsage[]>()).entries())
    .map(([card, items]) => ({
      card,
      items: items.sort((a, b) => a.benefit.benefit.localeCompare(b.benefit.benefit)),
      used: items.reduce((sum, usage) => sum + usage.used, 0),
      left: items.reduce((sum, usage) => sum + usage.remaining, 0),
    }))
    .sort((a, b) => b.left - a.left || a.card.localeCompare(b.card))
  const toggleGroup = (key: string) => setCollapsed((current) => {
    const next = new Set(current ?? groups.map((group) => group.key))
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const isGroupCollapsed = (key: string) => collapsed?.has(key) ?? true
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <BenefitKpi label="Benefits tracked" value={String(groups.length)} />
      <BenefitKpi label="Used this period" value={currency.format(totalUsed)} />
      <BenefitKpi label="Left this period" value={currency.format(totalLeft)} />
    </div>
    <Input value={cardSearch} onChange={(event) => setCardSearch(event.target.value)} placeholder="Search cards..." autoComplete="off" />
    <div className="grid h-10 grid-cols-2 gap-1 rounded-full bg-accent/60 p-0.5">
      {(['benefit', 'card'] as const).map((mode) => <button key={mode} type="button" className={`rounded-full px-3 text-xs font-extrabold capitalize transition ${view === mode ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/70'}`} onClick={() => setView(mode)}>{mode === 'benefit' ? 'Benefit view' : 'Card view'}</button>)}
    </div>
    {!visibleUsages.length && <div className="rounded-3xl border border-dashed bg-accent/35 p-5 text-center text-sm font-semibold text-muted-foreground">No matching cards.</div>}
    {visibleUsages.length > 0 && view === 'card' && <div className="grid gap-3 md:grid-cols-2">
      {cardGroups.map((group) => <div key={group.card} className="rounded-3xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{group.card}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{currency.format(group.used)} used · {currency.format(group.left)} left</p>
          </div>
        </div>
        <div className="mt-2 divide-y divide-border/60">
          {group.items.map((usage) => {
            const template = benefitByRow.get(usage.benefit.rowIndex) || usage.benefit
            const credit = usage.creditRows?.[0]
            const pct = usage.benefit.amount > 0 ? Math.min(100, Math.round((usage.used / usage.benefit.amount) * 100)) : 0
            return <div key={`${usage.benefit.rowIndex}-${usage.benefit.card}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold">{usage.benefit.benefit}</p>
                <p className="truncate text-[11px] font-semibold text-muted-foreground">{currency.format(usage.used)} / {currency.format(usage.benefit.amount)} · {currency.format(usage.remaining)} left</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="secondary" size="sm" className="h-8 rounded-full px-3 text-xs" disabled={creditsDisabled} onClick={() => onEditCredit(usage, credit)}>{credit ? 'Edit' : 'Used'}</Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditBenefit(template)} aria-label={`Edit ${usage.benefit.benefit}`}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          })}
        </div>
      </div>)}
    </div>}
    {visibleUsages.length > 0 && view === 'benefit' && <div className="space-y-3">
      {groups.map((group) => {
        const groupPct = group.amount > 0 ? Math.min(100, Math.round((group.used / group.amount) * 100)) : 0
        const isCollapsed = isGroupCollapsed(group.key)
        return <div key={group.key} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          <div className={`border-border/60 bg-accent/25 px-3 py-2.5 transition sm:px-4 ${isCollapsed ? '' : 'border-b'}`}>
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleGroup(group.key)} aria-expanded={!isCollapsed}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{group.name}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{group.product} · {group.items.length} card{group.items.length === 1 ? '' : 's'} · {currency.format(group.left)} left</p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <p className="hidden text-xs font-extrabold tabular-nums text-muted-foreground sm:block">{currency.format(group.used)} / {currency.format(group.amount)}</p>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => group.benefit && onEditBenefit(group.benefit)} disabled={!group.benefit} aria-label={`Edit ${group.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => group.benefit && setConfirmBenefit(group.benefit)} disabled={!group.benefit || deleteBenefit.isPending} aria-label={`Delete ${group.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                <button type="button" className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground" onClick={() => toggleGroup(group.key)} aria-expanded={!isCollapsed}>{isCollapsed ? 'Show' : 'Hide'}</button>
              </div>
            </div>
            <button type="button" className="mt-2 block w-full" onClick={() => toggleGroup(group.key)} aria-label={`${isCollapsed ? 'Show' : 'Hide'} ${group.name}`}>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${groupPct}%` }} />
              </div>
            </button>
          </div>
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
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" variant="secondary" size="sm" className="h-8 justify-center rounded-full px-3 text-xs sm:w-auto" disabled={creditsDisabled} onClick={() => onEditCredit(usage, credit)}>
                    {credit ? 'Edit' : 'Used'}
                  </Button>
                </div>
              </div>
            })}
          </div>}
        </div>
      })}
    </div>}
    <ConfirmDialog
      open={!!confirmBenefit}
      onOpenChange={(open) => { if (!open) setConfirmBenefit(null) }}
      title={`Delete ${confirmBenefit?.benefit || 'benefit'}?`}
      description="This clears the benefit row from CardBenefits. Matching expenses and manual credits stay unchanged."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => { if (confirmBenefit) await deleteBenefit.mutateAsync(confirmBenefit) }}
    />
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
