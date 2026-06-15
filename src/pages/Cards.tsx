import * as React from 'react'
import { Pencil, Plus, Trash2, WalletCards } from 'lucide-react'
import { PageErrorBoundary } from '../components/ErrorBoundary'
import { SkeletonCards } from '../components/layout/Skeletons'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dialog, Input, Textarea } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useAddCard, useCards, useCreateCardsTab, useDeleteCard, useUpdateCard, useCardOrder, makeCardComparator, type CardRow } from '../hooks/useCards'
import { useExpenses } from '../hooks/useExpenses'
import { currency, filterByDateRange, getPresetRange } from '../lib/format'
import { cn } from '../lib/utils'

type CardForm = Omit<CardRow, 'rowIndex'>
const emptyCard = (): CardForm => ({ name: '', issuer: '', last4: '', active: true, note: '' })

type CardSpend = { month: number; total: number; count: number }
const zeroSpend: CardSpend = { month: 0, total: 0, count: 0 }

export function CardsPage() {
  return <PageErrorBoundary><CardsContent /></PageErrorBoundary>
}

function CardsContent() {
  const { cards, tabMissing, isLoading, error } = useCards()
  const cardOrder = useCardOrder()
  const expensesQuery = useExpenses()
  const createTab = useCreateCardsTab()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CardRow | null>(null)

  // The Summary!G17:G list is the canonical card roster — same source
  // the expense picker uses. We materialize one row per Summary entry,
  // enriching with Cards-tab metadata when the name matches. If Summary
  // is missing entirely we fall back to whatever's in the Cards tab.
  const displayCards = React.useMemo<CardRow[]>(() => {
    const byName = new Map<string, CardRow>()
    cards.forEach((card) => {
      const key = card.name.trim().toLocaleLowerCase()
      if (key && !byName.has(key)) byName.set(key, card)
    })
    if (cardOrder.length === 0) {
      return [...cards].sort(makeCardComparator([]))
    }
    const seen = new Set<string>()
    const result: CardRow[] = []
    cardOrder.forEach((rawName, index) => {
      const name = rawName.trim()
      if (!name) return
      const key = name.toLocaleLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      const matched = byName.get(key)
      result.push({
        rowIndex: matched?.rowIndex ?? -(index + 1),
        name: matched?.name || name,
        issuer: matched?.issuer || '',
        last4: matched?.last4 || '',
        active: matched?.active ?? true,
        note: matched?.note || '',
      })
    })
    return result
  }, [cards, cardOrder])

  const spendByCard = React.useMemo(() => {
    const data = expensesQuery.data || []
    const range = getPresetRange('thisMonth')
    const monthSet = new Set(filterByDateRange(data, range.start, range.end).map((expense) => expense.rowIndex))
    const map = new Map<string, CardSpend>()
    data.forEach((expense) => {
      const key = expense.paymentMethod.trim().toLocaleLowerCase()
      if (!key) return
      const entry = map.get(key) || { month: 0, total: 0, count: 0 }
      entry.total += expense.amount
      entry.count += 1
      if (monthSet.has(expense.rowIndex)) entry.month += expense.amount
      map.set(key, entry)
    })
    return map
  }, [expensesQuery.data])

  const getSpend = React.useCallback(
    (name: string) => spendByCard.get(name.trim().toLocaleLowerCase()) || zeroSpend,
    [spendByCard],
  )

  if (isLoading) return <SkeletonCards />
  if (error) return <EmptyState title="Could not load cards" text={error.message} />
  if (tabMissing) return <EmptyState title="Set up Cards tab in your sheet" text="Create a Cards tab with Name, Issuer, Last4, Active, and Note columns." action={<Button onClick={() => createTab.mutate()} disabled={createTab.isPending}>{createTab.isPending ? 'Creating...' : 'Create Cards tab'}</Button>} />

  const monthTotal = displayCards.reduce((sum, card) => sum + getSpend(card.name).month, 0)

  const openAdd = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (card: CardRow) => {
    // For synthetic rows (Summary list entries with no backing Cards-tab
    // row) we still pass the card in — the dialog will detect the negative
    // rowIndex and open in "add new" mode with the name pre-filled.
    setEditing(card)
    setDialogOpen(true)
  }

  return <div className="relative space-y-5 md:space-y-7">
    <div className="soft-blob right-10 top-0 hidden h-64 w-64 bg-peach/25 md:block" />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Credit Cards</h1>
        <p className="text-sm text-muted-foreground">{cardOrder.length > 0 ? <>List sourced from <span className="font-semibold text-foreground">Summary!G17:G</span> · spend pulled from your expenses.</> : 'Manage card names used by expense payment methods.'}</p>
      </div>
      <Button onClick={openAdd}><Plus className="h-4 w-4" />Add card</Button>
    </div>
    <div className="grid grid-cols-3 gap-2 md:gap-3">
      <Kpi label="Cards on list" emoji="💳" value={String(displayCards.length)} tint="from-sky/15 to-lavender/10" />
      <Kpi label="This month" emoji="💸" value={currency.format(monthTotal)} tint="from-coral/15 to-peach/20" />
      <Kpi label="Active" emoji="✨" value={String(displayCards.filter((card) => card.active).length)} tint="from-mint/15 to-sage/15" />
    </div>
    {!displayCards.length ? <EmptyState title="No cards yet" text="Add credit cards here so they show up first in the Expense payment method picker." /> : <Card className="overflow-hidden rounded-2xl">
      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_6rem] gap-3 border-b border-border/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          <span>Name</span><span>Issuer</span><span className="text-right">This month</span><span className="text-right">All time</span><span>Status</span><span>Actions</span>
        </div>
        {displayCards.map((card) => <CardListRow key={card.rowIndex} card={card} spend={getSpend(card.name)} onEdit={openEdit} />)}
      </div>
      <div className="space-y-2 p-2 md:hidden">{displayCards.map((card) => <CardMobileRow key={card.rowIndex} card={card} spend={getSpend(card.name)} onEdit={openEdit} />)}</div>
    </Card>}
    <CardDialog open={dialogOpen} onOpenChange={setDialogOpen} card={editing} />
  </div>
}

function Kpi({ label, emoji, value, tint }: { label: string; emoji: string; value: string; tint: string }) {
  return <Card className={`overflow-hidden rounded-2xl bg-gradient-to-br ${tint}`}><CardHeader className="p-3 pb-1 md:p-4 md:pb-1.5"><CardTitle className="flex items-center gap-1.5 text-[11px] text-muted-foreground md:text-xs"><span>{emoji}</span>{label}</CardTitle></CardHeader><CardContent className="px-3 pb-3 pt-0 md:px-4 md:pb-4"><div className="font-display text-lg font-extrabold md:text-2xl">{value}</div></CardContent></Card>
}

function CardListRow({ card, spend, onEdit }: { card: CardRow; spend: CardSpend; onEdit: (card: CardRow) => void }) {
  const synthetic = card.rowIndex < 0
  return <div className={cn('grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_6rem] items-center gap-3 border-b border-border/50 px-4 py-2.5 text-sm last:border-b-0', !card.active && 'opacity-55')}>
    <div className="min-w-0"><p className="truncate font-semibold">{card.name}</p><p className="text-xs text-muted-foreground">{card.last4 ? `••••${card.last4}` : (synthetic ? 'Not in Cards tab yet' : 'No last4')}</p></div>
    <span className="truncate text-muted-foreground">{card.issuer || '—'}</span>
    <span className="text-right font-display font-bold text-coral tabular-nums">{spend.month > 0 ? currency.format(spend.month) : <span className="font-sans text-xs font-medium text-muted-foreground">—</span>}</span>
    <span className="text-right tabular-nums text-muted-foreground">{spend.total > 0 ? <><span className="font-semibold text-foreground">{currency.format(spend.total)}</span><span className="ml-1 text-[11px]">· {spend.count}</span></> : '—'}</span>
    <ActiveToggle card={card} />
    <RowActions card={card} onEdit={onEdit} />
  </div>
}

function CardMobileRow({ card, spend, onEdit }: { card: CardRow; spend: CardSpend; onEdit: (card: CardRow) => void }) {
  const synthetic = card.rowIndex < 0
  return <div className={cn('rounded-2xl border border-border/70 bg-white/70 p-3 shadow-sm dark:bg-card/70', !card.active && 'opacity-55')}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{card.name}</p><p className="truncate text-xs text-muted-foreground">{[card.issuer, card.last4 && `••••${card.last4}`].filter(Boolean).join(' · ') || (synthetic ? 'Not in Cards tab yet' : 'No details')}</p></div>
      <RowActions card={card} onEdit={onEdit} />
    </div>
    <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-2xl bg-accent/40 px-3 py-2 text-xs">
      <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">This month</p><p className="font-display text-base font-extrabold text-coral tabular-nums">{currency.format(spend.month)}</p></div>
      <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">All time</p><p className="font-display text-base font-bold tabular-nums">{currency.format(spend.total)}<span className="ml-1 text-[10px] font-medium text-muted-foreground">· {spend.count}</span></p></div>
    </div>
    {card.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{card.note}</p>}
    <div className="mt-3"><ActiveToggle card={card} /></div>
  </div>
}

function ActiveToggle({ card }: { card: CardRow }) {
  const updateCard = useUpdateCard()
  const synthetic = card.rowIndex < 0
  if (synthetic) {
    // No backing Cards-tab row to toggle; status is implicit.
    return <Badge variant="outline">From list</Badge>
  }
  return <button type="button" className="inline-flex items-center" onClick={() => updateCard.mutate({ ...card, active: !card.active })} disabled={updateCard.isPending}>
    <Badge variant={card.active ? 'success' : 'outline'}>{card.active ? 'Active' : 'Inactive'}</Badge>
  </button>
}

function RowActions({ card, onEdit }: { card: CardRow; onEdit: (card: CardRow) => void }) {
  const deleteCard = useDeleteCard()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const synthetic = card.rowIndex < 0
  return <div className="flex justify-end gap-1">
    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => onEdit(card)} aria-label={synthetic ? `Add ${card.name} to Cards tab` : `Edit ${card.name}`}><Pencil className="h-4 w-4" /></Button>
    {!synthetic && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)} disabled={deleteCard.isPending} aria-label={`Delete ${card.name}`}><Trash2 className="h-4 w-4" /></Button>}
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title={`Delete ${card.name}?`}
      description="This removes the card from your Google Sheet. Past expenses paid with it stay."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => { await deleteCard.mutateAsync(card) }}
    />
  </div>
}

function CardDialog({ open, onOpenChange, card }: { open: boolean; onOpenChange: (open: boolean) => void; card: CardRow | null }) {
  const addCard = useAddCard()
  const updateCard = useUpdateCard()
  const { toast } = useToast()
  const [form, setForm] = React.useState<CardForm>(emptyCard)
  // Synthetic rows (rowIndex < 0) come from the Summary list and have no
  // backing Cards-tab row yet, so we treat them as "add with prefilled name".
  const isExisting = !!card && card.rowIndex >= 0

  React.useEffect(() => {
    if (open) setForm(card ? { name: card.name, issuer: card.issuer, last4: card.last4, active: card.active, note: card.note } : emptyCard())
  }, [open, card])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload = { ...form, name: form.name.trim(), issuer: form.issuer.trim(), last4: form.last4.trim(), note: form.note.trim() }
    if (!payload.name) return toast({ title: 'Card name is required.', variant: 'destructive' })
    try {
      if (isExisting && card) await updateCard.mutateAsync({ ...payload, rowIndex: card.rowIndex })
      else await addCard.mutateAsync(payload)
      toast({ title: isExisting ? 'Card updated' : 'Card added' })
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Could not save card', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const saving = addCard.isPending || updateCard.isPending
  return <Dialog open={open} onOpenChange={onOpenChange} title={isExisting ? 'Edit card' : 'Add card'} description="Save card options to the Cards tab in Google Sheets." mobileBottomSheet>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Name<Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Chase Sapphire" /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Issuer<Input value={form.issuer} onChange={(event) => setForm({ ...form, issuer: event.target.value })} placeholder="Chase" /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Last4<Input inputMode="numeric" maxLength={4} value={form.last4} onChange={(event) => setForm({ ...form, last4: event.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1234" /></label>
      <label className="flex items-center gap-3 rounded-3xl border border-border/70 bg-white/70 p-3 text-sm font-semibold text-muted-foreground dark:bg-card/70 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-coral" />Active</label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Note<Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Benefits, annual fee, reminders..." /></label>
      <div className="sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] flex flex-col-reverse gap-2 border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl sm:col-span-2 sm:-mx-7 sm:-mb-8 sm:flex-row sm:justify-end sm:pb-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : (isExisting ? 'Save changes' : 'Add card')}</Button></div>
    </form>
  </Dialog>
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <Card className="mx-auto max-w-2xl border-dashed bg-gradient-to-br from-coral/10 to-peach/10"><CardContent className="pt-7 text-center"><WalletCards className="mx-auto h-10 w-10 text-coral" /><h2 className="mt-3 font-display text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</CardContent></Card>
}
