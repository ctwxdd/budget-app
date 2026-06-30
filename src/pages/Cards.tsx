import * as React from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ListFilter, Pencil, Plus, Search, Trash2, WalletCards, X } from 'lucide-react'
import { PageErrorBoundary } from '../components/ErrorBoundary'
import { SkeletonCards } from '../components/layout/Skeletons'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dialog, Input, Select, Textarea } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useAddCard, useCards, useCreateCardsTab, useDeleteCard, useUpdateCard, type CardRow } from '../hooks/useCards'
import { useAddCardBenefit, useCardBenefits, useDeleteCardBenefit, useUpdateCardBenefit } from '../hooks/useCardBenefits'
import { useExpenses } from '../hooks/useExpenses'
import { calculateBenefitUsageByCard, cardProductName, expandCardBenefitsForCards, type BenefitUsage, type CardBenefit, type CardBenefitPeriod } from '../lib/cardBenefits'
import { currency, filterByDateRange, getPresetRange } from '../lib/format'
import { cn } from '../lib/utils'
import { ExpenseDialog, type FormState } from '../components/expenses/ExpenseDialog'
import { useLanguage } from '../hooks/useLanguage'

type CardForm = Pick<CardRow, 'name' | 'product' | 'issuer' | 'last4' | 'active' | 'note' | 'annualFee' | 'subBonus'> & {
  subRequired: number
  subStart: string
  subPeriodMonths: number
}
type CardsView = 'cards' | 'list'
const VIEW_KEY = 'credit-cards-view'
const emptyCard = (): CardForm => ({ name: '', product: '', issuer: '', last4: '', active: true, note: '', annualFee: 0, subRequired: 0, subStart: '', subPeriodMonths: 0, subBonus: '' })
const benefitPeriods: CardBenefitPeriod[] = ['monthly', 'quarterly', 'semiannual', 'annual']

// Adds `months` whole months to a YYYY-MM-DD string (UTC, day-clamped).
function addMonthsISO(iso: string, months: number): string {
  if (!iso || !months) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

function monthsBetweenISO(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start), e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (30.4375 * 86400000)))
}

type CardSpend = { month: number; total: number; count: number }
const zeroSpend: CardSpend = { month: 0, total: 0, count: 0 }

type SubStatus = {
  spent: number
  goal: number
  remaining: number
  daysLeft: number
  totalDays: number
  progress: number       // 0..1, spend / required
  paceProgress: number   // 0..1, time elapsed / total
  state: 'met' | 'on-track' | 'behind' | 'expired' | 'upcoming'
  label: string
  emoji: string
}

const TODAY = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
const isAnnualFeeCategory = (category: string) => /annual\s*fee/i.test(category)

function computeSubStatus(card: CardRow, spentInWindow: number): SubStatus | null {
  if (!card.subRequired || !card.subStart || !card.subDeadline) return null
  const goal = card.subRequired
  const today = TODAY()
  const totalDays = Math.max(1, daysBetween(card.subStart, card.subDeadline))
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(card.subStart, today)))
  const remaining = Math.max(0, goal - spentInWindow)
  const daysLeft = Math.max(0, daysBetween(today, card.subDeadline))
  const progress = Math.min(1, spentInWindow / goal)
  const paceProgress = Math.min(1, elapsedDays / totalDays)

  if (spentInWindow >= goal) return { spent: spentInWindow, goal, remaining: 0, daysLeft, totalDays, progress: 1, paceProgress, state: 'met', label: 'Met', emoji: '✅' }
  if (today < card.subStart) return { spent: spentInWindow, goal, remaining, daysLeft, totalDays, progress, paceProgress, state: 'upcoming', label: 'Upcoming', emoji: '🕒' }
  if (today > card.subDeadline) return { spent: spentInWindow, goal, remaining, daysLeft: 0, totalDays, progress, paceProgress: 1, state: 'expired', label: 'Expired', emoji: '❌' }
  // Active window: compare spend pace vs. time pace
  const onTrack = progress >= paceProgress - 0.02
  return { spent: spentInWindow, goal, remaining, daysLeft, totalDays, progress, paceProgress, state: onTrack ? 'on-track' : 'behind', label: onTrack ? 'On track' : 'Behind', emoji: onTrack ? '🟢' : '🟠' }
}

const isSubActive = (status: SubStatus | null) => status?.state === 'on-track' || status?.state === 'behind'

export function CardsPage() {
  return <PageErrorBoundary><CardsContent /></PageErrorBoundary>
}

function CardsContent() {
  const navigate = useNavigate()
  const { cards, tabMissing, isLoading, error } = useCards()
  const { t } = useLanguage()
  const expensesQuery = useExpenses()
  const cardBenefits = useCardBenefits()
  const createTab = useCreateCardsTab()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [benefitCard, setBenefitCard] = React.useState<CardRow | null>(null)
  const [editingBenefit, setEditingBenefit] = React.useState<CardBenefit | null>(null)
  const [editing, setEditing] = React.useState<CardRow | null>(null)
  const [spendTemplate, setSpendTemplate] = React.useState<FormState | null>(null)
  const [selectedRow, setSelectedRow] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set())
  const [view, setView] = React.useState<CardsView>(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'
  })

  React.useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  const handleSpend = React.useCallback((card: CardRow) => {
    setSpendTemplate({
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: 0,
      description: '',
      category: '',
      paymentMethod: card.name,
      reimbursement: '',
      tags: '',
    })
  }, [])
  const handleViewExpenses = React.useCallback((card: CardRow) => {
    const params = new URLSearchParams({ payment: card.name, preset: 'all', from: 'cards' })
    navigate(`/expenses?${params.toString()}`)
  }, [navigate])
  const handleSelect = React.useCallback((rowIndex: number) => {
    setSelectedRow((current) => (current === rowIndex ? null : rowIndex))
  }, [])
  const toggleExpanded = React.useCallback((rowIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }, [])

  // Aggregate expenses by payment method: month + all-time spend.
  const spendByCard = React.useMemo(() => {
    const data = expensesQuery.data || []
    const range = getPresetRange('thisMonth')
    const monthSet = new Set(filterByDateRange(data, range.start, range.end).map((expense) => expense.rowIndex))
    const map = new Map<string, CardSpend>()
    data.forEach((expense) => {
      if (isAnnualFeeCategory(expense.category)) return
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

  // Aggregate spend per card within its SUB window — only computed for
  // cards that actually have a window defined.
  const subSpendByRow = React.useMemo(() => {
    const data = expensesQuery.data || []
    const windows = cards
      .filter((card) => card.subRequired && card.subStart && card.subDeadline)
      .map((card) => ({ rowIndex: card.rowIndex, key: card.name.trim().toLocaleLowerCase(), start: card.subStart, end: card.subDeadline }))
    const map = new Map<number, number>()
    windows.forEach((w) => map.set(w.rowIndex, 0))
    if (!windows.length) return map
    data.forEach((expense) => {
      if (isAnnualFeeCategory(expense.category)) return
      const key = expense.paymentMethod.trim().toLocaleLowerCase()
      if (!key) return
      for (const w of windows) {
        if (w.key !== key) continue
        if (expense.date < w.start || expense.date > w.end) continue
        map.set(w.rowIndex, (map.get(w.rowIndex) || 0) + expense.amount)
      }
    })
    return map
  }, [cards, expensesQuery.data])

  const subStatusByRow = React.useMemo(() => {
    const map = new Map<number, SubStatus>()
    cards.forEach((card) => {
      const status = computeSubStatus(card, subSpendByRow.get(card.rowIndex) || 0)
      if (status) map.set(card.rowIndex, status)
    })
    return map
  }, [cards, subSpendByRow])

  const effectiveBenefits = React.useMemo(() => expandCardBenefitsForCards(cardBenefits.benefits, cards), [cardBenefits.benefits, cards])
  const benefitUsageByCard = React.useMemo(() => calculateBenefitUsageByCard(effectiveBenefits, expensesQuery.data || []), [effectiveBenefits, expensesQuery.data])
  const getBenefits = React.useCallback(
    (name: string) => benefitUsageByCard.get(name.trim().toLocaleLowerCase()) || [],
    [benefitUsageByCard],
  )

  const getSpend = React.useCallback(
    (name: string) => spendByCard.get(name.trim().toLocaleLowerCase()) || zeroSpend,
    [spendByCard],
  )

  // Filter (search + hide-inactive) then sort.
  const visibleCards = React.useMemo(() => {
    const q = search.trim().toLocaleLowerCase()
    const filtered = cards.filter((card) => {
      if (!showInactive && !card.active) return false
      if (!q) return true
      return [card.name, card.issuer, card.last4, card.note, card.subBonus]
        .some((field) => field && field.toLocaleLowerCase().includes(q))
    })
    return filtered.sort((a, b) => {
      const aSub = subStatusByRow.get(a.rowIndex) || null
      const bSub = subStatusByRow.get(b.rowIndex) || null
      const aActive = isSubActive(aSub) ? 1 : 0
      const bActive = isSubActive(bSub) ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      if (aActive && bActive) {
        // Earliest deadline first when both are open
        const cmp = a.subDeadline.localeCompare(b.subDeadline)
        if (cmp !== 0) return cmp
      }
      // Reverse time order — newest SUB start first; cards without a SUB
      // start fall through to rowIndex desc so newly-added rows surface.
      const aStart = a.subStart || ''
      const bStart = b.subStart || ''
      if (aStart !== bStart) return bStart.localeCompare(aStart)
      return b.rowIndex - a.rowIndex
    })
  }, [cards, search, showInactive, subStatusByRow])

  if (isLoading) return <SkeletonCards />
  if (error) return <EmptyState title={t('card.loadError', 'Could not load cards')} text={error.message} />
  if (tabMissing) return <EmptyState title={t('card.setupTitle', 'Set up Cards tab in your sheet')} text={t('card.setupDescription', 'Create a Cards tab with Name, Issuer, Last4, Active, Note, Annual Fee, SUB Required, SUB Start, SUB Deadline, SUB Bonus, and Product columns.')} action={<Button onClick={() => createTab.mutate()} disabled={createTab.isPending}>{createTab.isPending ? t('card.creating', 'Creating...') : t('card.createTab', 'Create Cards tab')}</Button>} />

  const monthTotal = cards.reduce((sum, card) => sum + (card.active ? getSpend(card.name).month : 0), 0)
  const subActiveCount = cards.filter((card) => isSubActive(subStatusByRow.get(card.rowIndex) || null)).length
  const benefitRemainingTotal = cards.reduce((sum, card) => sum + getBenefits(card.name).reduce((inner, benefit) => inner + benefit.remaining, 0), 0)

  const openAdd = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (card: CardRow) => { setEditing(card); setDialogOpen(true) }

  return <div className="relative space-y-5 md:space-y-7">
    <div className="soft-blob right-10 top-0 hidden h-64 w-64 bg-peach/25 md:block" />
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      <Kpi label={t('card.cardsOnList', 'Cards on list')} emoji="💳" value={String(cards.length)} tint="from-sky/15 to-lavender/10" />
      <Kpi label={t('card.subOpen', 'SUB open')} emoji="🎁" value={String(subActiveCount)} tint="from-coral/15 to-peach/20" />
      <Kpi label={t('expenses.thisMonth', 'This month')} emoji="💸" value={currency.format(monthTotal)} tint="from-mint/15 to-sage/15" />
      <Kpi label="Credits left" emoji="🏷️" value={currency.format(benefitRemainingTotal)} tint="from-amber-200/30 to-peach/20" />
    </div>

    {cardBenefits.tabMissing && <Card className="rounded-2xl border-dashed bg-butter/10 p-4 text-sm">
      <p className="font-bold">Add a CardBenefits tab to track card credits.</p>
      <p className="mt-1 text-xs text-muted-foreground">Columns: Card, Benefit, Amount, Period, Category, Merchant/Tag, Start Date, End Date, Active.</p>
    </Card>}

    <div className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-white/60 p-2 shadow-sm backdrop-blur dark:bg-card/60 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('card.searchPlaceholder', 'Search by name, issuer, last4, note…')} className="pl-9 pr-9" />
        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent" aria-label={t('common.clear', 'Clear search')}><X className="h-4 w-4" /></button>}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:pb-0">
        <button type="button" role="switch" aria-checked={showInactive} onClick={() => setShowInactive((v) => !v)} className="flex h-10 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold text-muted-foreground transition hover:bg-accent/50 hover:text-foreground">
          <span className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition', showInactive ? 'bg-coral' : 'bg-border')}>
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition', showInactive ? 'translate-x-[1.125rem]' : 'translate-x-0.5')} />
          </span>
          <span className="sm:hidden">{t('card.inactive', 'Inactive')}</span>
          <span className="hidden sm:inline">{t('card.showInactive', 'Show inactive')}</span>
        </button>
        <span className="hidden whitespace-nowrap text-xs font-medium text-muted-foreground sm:inline">{visibleCards.length} {t('expenses.of', 'of')} {cards.length}</span>
        <div className="grid h-10 shrink-0 grid-cols-2 gap-1 rounded-full bg-accent/60 p-0.5">
          {(['cards', 'list'] as const).map((mode) => <button key={mode} type="button" className={cn('rounded-full px-3 text-xs font-semibold capitalize transition', view === mode ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')} onClick={() => setView(mode)}>{mode === 'cards' ? `▦ ${t('card.cardsView', 'Cards')}` : `≣ ${t('expenses.listView', 'List')}`}</button>)}
        </div>
        <Button onClick={openAdd} variant="gradient" className="h-10 w-10 shrink-0 justify-center whitespace-nowrap rounded-full p-0 shadow-soft sm:w-auto sm:px-4" aria-label={t('card.addCard', 'Add card')}><Plus className="h-4 w-4" /><span className="hidden sm:inline">{t('card.newCard', 'New card')}</span></Button>
      </div>
    </div>

    {!visibleCards.length ? <EmptyState title={search ? t('common.noMatches', 'No matches') : (!showInactive && cards.some((c) => !c.active) ? t('card.noActive', 'No active cards') : t('card.noCards', 'No cards yet'))} text={search ? (t('card.noSearchMatches', 'Nothing matches') + ` "${search}".`) : (!showInactive && cards.some((c) => !c.active) ? t('card.noActiveHelp', 'All your cards are marked inactive — enable "Show inactive" to see them.') : t('card.noCardsHelp', 'Add credit cards here so they show up first in the Expense payment method picker.'))} action={!cards.length ? <Button onClick={openAdd}><Plus className="h-4 w-4" />{t('card.addCard', 'Add card')}</Button> : undefined} /> : view === 'cards' ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visibleCards.map((card) => { const s = subStatusByRow.get(card.rowIndex) || null; const rowSub = isSubActive(s) ? s : null; return <CardMobileRow key={card.rowIndex} card={card} spend={getSpend(card.name)} sub={rowSub} benefits={getBenefits(card.name)} expanded={expanded.has(card.rowIndex)} onToggle={() => toggleExpanded(card.rowIndex)} onEdit={openEdit} onSpend={handleSpend} onViewExpenses={handleViewExpenses} onAddBenefit={cardBenefits.tabMissing ? undefined : setBenefitCard} onEditBenefit={(benefit) => { setBenefitCard(card); setEditingBenefit(benefit) }} selected={selectedRow === card.rowIndex} onSelect={() => handleSelect(card.rowIndex)} /> })}
    </div> : <Card className="overflow-hidden rounded-2xl">
      <div className="hidden md:block">
        <div className="grid grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_5.5rem_5.5rem] gap-3 border-b border-border/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          <span /><span>{t('card.name', 'Name')}</span><span>{t('card.issuer', 'Issuer')}</span><span className="text-right">AF</span><span className="text-right">{t('expenses.thisMonth', 'This month')}</span><span className="text-right">{t('card.allTime', 'All time')}</span><span>SUB</span><span>{t('card.status', 'Status')}</span><span>{t('expenses.actions', 'Actions')}</span>
        </div>
        {visibleCards.map((card) => { const s = subStatusByRow.get(card.rowIndex) || null; const rowSub = isSubActive(s) ? s : null; return <CardListRow key={card.rowIndex} card={card} spend={getSpend(card.name)} sub={rowSub} benefits={getBenefits(card.name)} expanded={expanded.has(card.rowIndex)} onToggle={() => toggleExpanded(card.rowIndex)} onEdit={openEdit} onSpend={handleSpend} onViewExpenses={handleViewExpenses} onAddBenefit={cardBenefits.tabMissing ? undefined : setBenefitCard} onEditBenefit={(benefit) => { setBenefitCard(card); setEditingBenefit(benefit) }} selected={selectedRow === card.rowIndex} onSelect={() => handleSelect(card.rowIndex)} /> })}
      </div>
      <div className="space-y-2 p-2 md:hidden">{visibleCards.map((card) => { const s = subStatusByRow.get(card.rowIndex) || null; const rowSub = isSubActive(s) ? s : null; return <CardMobileRow key={card.rowIndex} card={card} spend={getSpend(card.name)} sub={rowSub} benefits={getBenefits(card.name)} expanded={expanded.has(card.rowIndex)} onToggle={() => toggleExpanded(card.rowIndex)} onEdit={openEdit} onSpend={handleSpend} onViewExpenses={handleViewExpenses} onAddBenefit={cardBenefits.tabMissing ? undefined : setBenefitCard} onEditBenefit={(benefit) => { setBenefitCard(card); setEditingBenefit(benefit) }} selected={selectedRow === card.rowIndex} onSelect={() => handleSelect(card.rowIndex)} /> })}</div>
    </Card>}
    <CardDialog open={dialogOpen} onOpenChange={setDialogOpen} card={editing} />
    <BenefitDialog open={!!benefitCard || !!editingBenefit} onOpenChange={(open) => { if (!open) { setBenefitCard(null); setEditingBenefit(null) } }} card={benefitCard} benefit={editingBenefit} />
    {spendTemplate && <ExpenseDialog open template={spendTemplate} onOpenChange={(open) => { if (!open) setSpendTemplate(null) }} />}
  </div>
}

function Kpi({ label, emoji, value, tint }: { label: string; emoji: string; value: string; tint: string }) {
  return <Card className={`overflow-hidden rounded-2xl bg-gradient-to-br ${tint}`}><CardHeader className="p-3 pb-1 md:p-4 md:pb-1.5"><CardTitle className="flex items-center gap-1.5 text-[11px] text-muted-foreground md:text-xs"><span>{emoji}</span>{label}</CardTitle></CardHeader><CardContent className="px-3 pb-3 pt-0 md:px-4 md:pb-4"><div className="font-display text-lg font-extrabold md:text-2xl">{value}</div></CardContent></Card>
}

function SubChip({ sub, compact }: { sub: SubStatus; compact?: boolean }) {
  // Only on-track / behind are surfaced now, so the chip is a simple
  // colored dot + label — no pill background, no emoji.
  const dot = sub.state === 'behind' ? 'bg-amber-500' : 'bg-teal-500'
  const text = sub.state === 'behind' ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'
  return <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums', text)}>
    <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
    {sub.label}{!compact && ` · ${sub.daysLeft}d`}
  </span>
}

function SubTracker({ card, sub }: { card: CardRow; sub: SubStatus }) {
  const pct = Math.round(sub.progress * 100)
  const pacePct = Math.round(sub.paceProgress * 100)
  return <div className="mt-2 rounded-2xl border border-border/60 bg-accent/30 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
      <div className="flex items-center gap-2">
        <SubChip sub={sub} />
        {card.subBonus && <span className="text-muted-foreground">🎁 {card.subBonus}</span>}
      </div>
      <span className="text-muted-foreground">{card.subStart} → {card.subDeadline}</span>
    </div>
    <div className="relative h-2 overflow-hidden rounded-full bg-border/60">
      <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all',
        sub.state === 'behind' ? 'bg-amber-500' : 'bg-teal-500')} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-2 w-px bg-foreground/40" style={{ left: `${pacePct}%` }} title={`Time pace ${pacePct}%`} />
    </div>
    <div className="mt-1.5 grid grid-cols-3 gap-2 tabular-nums">
      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Spent</p><p className="font-semibold text-foreground">{currency.format(sub.spent)} <span className="text-[10px] font-normal text-muted-foreground">/ {currency.format(sub.goal)}</span></p></div>
      <div className="text-center"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">To go</p><p className="font-semibold text-foreground">{currency.format(sub.remaining)}</p></div>
      <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Days left</p><p className="font-semibold text-foreground">{sub.daysLeft}</p></div>
    </div>
  </div>
}

function BenefitChips({ benefits }: { benefits: BenefitUsage[] }) {
  if (!benefits.length) return null
  return <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
    {benefits.slice(0, 3).map((usage) => <span key={usage.benefit.rowIndex} className="inline-flex max-w-full items-center rounded-full border border-mint/30 bg-mint/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-mint" title={`${usage.benefit.benefit}: ${currency.format(usage.used)} used, ${currency.format(usage.remaining)} left`}>
      <span className="truncate">{usage.benefit.benefit}</span><span className="ml-1 shrink-0">{currency.format(usage.remaining)} left</span>
    </span>)}
    {benefits.length > 3 && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">+{benefits.length - 3}</span>}
  </div>
}

function BenefitTracker({ benefits, onEdit }: { benefits: BenefitUsage[]; onEdit: (benefit: CardBenefit) => void }) {
  const deleteBenefit = useDeleteCardBenefit()
  const [confirmBenefit, setConfirmBenefit] = React.useState<CardBenefit | null>(null)
  if (!benefits.length) return null
  return <div className="mt-2 grid gap-2 md:grid-cols-2">
    {benefits.map((usage) => {
      const pct = usage.benefit.amount > 0 ? Math.min(100, Math.round((usage.used / usage.benefit.amount) * 100)) : 0
      return <div key={usage.benefit.rowIndex} className="rounded-2xl border border-mint/30 bg-mint/10 p-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-extrabold text-emerald-700 dark:text-mint">{usage.benefit.benefit}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{usage.start} → {usage.end}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-bold text-foreground">{currency.format(usage.remaining)} left</span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(usage.benefit)} aria-label={`Edit ${usage.benefit.benefit}`}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmBenefit(usage.benefit)} disabled={deleteBenefit.isPending} aria-label={`Delete ${usage.benefit.benefit}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border/60">
          <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between tabular-nums text-muted-foreground">
          <span>Used {currency.format(usage.used)} / {currency.format(usage.benefit.amount)}</span>
          <span>{usage.count} match{usage.count === 1 ? '' : 'es'}</span>
        </div>
      </div>
    })}
    <ConfirmDialog
      open={!!confirmBenefit}
      onOpenChange={(open) => { if (!open) setConfirmBenefit(null) }}
      title={`Delete ${confirmBenefit?.benefit || 'benefit'}?`}
      description="This clears the benefit row from CardBenefits. Matching expenses stay unchanged."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => { if (confirmBenefit) await deleteBenefit.mutateAsync(confirmBenefit) }}
    />
  </div>
}

function CardActionBar({ card, onSpend, onViewExpenses, onAddBenefit }: { card: CardRow; onSpend: (card: CardRow) => void; onViewExpenses: (card: CardRow) => void; onAddBenefit?: (card: CardRow) => void }) {
  return <div className="border-t border-border/60 bg-gradient-to-r from-accent/10 via-accent/35 to-accent/10 px-3 py-3 md:px-4">
    <div className="mx-auto flex w-full max-w-xl flex-nowrap items-center justify-center gap-2 rounded-full border border-border/60 bg-card/85 p-1.5 shadow-sm backdrop-blur">
      <Button type="button" size="sm" variant="gradient" className="min-w-0 flex-1 justify-center rounded-full" onClick={(event) => { event.stopPropagation(); onSpend(card) }}>
        <Plus className="h-4 w-4 shrink-0" /><span className="truncate">Add expense</span>
      </Button>
      {onAddBenefit && <Button type="button" size="sm" variant="outline" className="min-w-0 flex-1 justify-center rounded-full bg-card/80" onClick={(event) => { event.stopPropagation(); onAddBenefit(card) }}>
        <Plus className="h-4 w-4 shrink-0" /><span className="truncate">Benefit</span>
      </Button>}
      <Button type="button" size="sm" variant="outline" className="min-w-0 flex-1 justify-center rounded-full bg-card/80" onClick={(event) => { event.stopPropagation(); onViewExpenses(card) }}>
        <ListFilter className="h-4 w-4 shrink-0" /><span className="truncate">View expenses</span>
      </Button>
    </div>
  </div>
}

function CardListRow({ card, spend, sub, benefits, expanded, onToggle, onEdit, onSpend, onViewExpenses, onAddBenefit, onEditBenefit, selected, onSelect }: { card: CardRow; spend: CardSpend; sub: SubStatus | null; benefits: BenefitUsage[]; expanded: boolean; onToggle: () => void; onEdit: (card: CardRow) => void; onSpend: (card: CardRow) => void; onViewExpenses: (card: CardRow) => void; onAddBenefit?: (card: CardRow) => void; onEditBenefit: (benefit: CardBenefit) => void; selected: boolean; onSelect: () => void }) {
  const hasDetails = Boolean(sub || benefits.length)
  return <div className={cn('border-b border-border/50 last:border-b-0 transition', !card.active && 'opacity-55', selected && 'bg-coral/5 ring-1 ring-inset ring-coral/30')}>
    <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }} className="grid cursor-pointer grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_5.5rem_5.5rem] items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-accent/30">
      <button type="button" onClick={(event) => { event.stopPropagation(); onToggle() }} disabled={!hasDetails} className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full transition', hasDetails ? 'text-foreground hover:bg-accent' : 'text-muted-foreground/30 cursor-default')} aria-label={expanded ? 'Collapse' : 'Expand trackers'}>
        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
      </button>
      <div className="min-w-0"><p className="truncate font-semibold">{card.name}</p><p className="text-xs text-muted-foreground">{card.last4 ? `••••${card.last4}` : 'No last4'}</p><BenefitChips benefits={benefits} /></div>
      <span className="truncate text-muted-foreground">{card.issuer || '—'}</span>
      <span className="text-right tabular-nums text-muted-foreground">{card.annualFee > 0 ? <span className="font-medium text-foreground">{currency.format(card.annualFee)}</span> : '—'}</span>
      <span className="text-right font-display font-bold text-coral tabular-nums">{spend.month !== 0 ? currency.format(spend.month) : <span className="font-sans text-xs font-medium text-muted-foreground">—</span>}</span>
      <span className="text-right tabular-nums text-muted-foreground">{spend.total !== 0 ? <><span className="font-semibold text-foreground">{currency.format(spend.total)}</span><span className="ml-1 text-[11px]">· {spend.count}</span></> : '—'}</span>
      <span>{sub ? <SubChip sub={sub} compact /> : benefits.length ? <span className="text-xs font-semibold text-emerald-700 dark:text-mint">{benefits.length} credit{benefits.length === 1 ? '' : 's'}</span> : <span className="text-xs text-muted-foreground">—</span>}</span>
      <span><ActiveStatus card={card} /></span>
      <span onClick={(event) => event.stopPropagation()}><RowActions card={card} onEdit={onEdit} /></span>
    </div>
    {selected && <CardActionBar card={card} onSpend={onSpend} onViewExpenses={onViewExpenses} onAddBenefit={onAddBenefit} />}
    {expanded && (sub || benefits.length > 0) && <div className="px-4 pb-3">{sub && <SubTracker card={card} sub={sub} />}<BenefitTracker benefits={benefits} onEdit={onEditBenefit} /></div>}
  </div>
}

function CardMobileRow({ card, spend, sub, benefits, expanded, onToggle, onEdit, onSpend, onViewExpenses, onAddBenefit, onEditBenefit, selected, onSelect }: { card: CardRow; spend: CardSpend; sub: SubStatus | null; benefits: BenefitUsage[]; expanded: boolean; onToggle: () => void; onEdit: (card: CardRow) => void; onSpend: (card: CardRow) => void; onViewExpenses: (card: CardRow) => void; onAddBenefit?: (card: CardRow) => void; onEditBenefit: (benefit: CardBenefit) => void; selected: boolean; onSelect: () => void }) {
  const hasDetails = Boolean(sub || benefits.length)
  const subtitle = [card.issuer, card.last4 && `••••${card.last4}`, card.annualFee > 0 && `${currency.format(card.annualFee)}/yr`].filter(Boolean).join(' · ')
  return <div className={cn('overflow-hidden rounded-2xl border bg-white/70 shadow-sm transition dark:bg-card/70', !card.active && 'opacity-55', selected ? 'border-coral/60 ring-2 ring-coral/20' : 'border-border/70')}>
    <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }} className="cursor-pointer p-3 transition hover:bg-accent/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{card.name}</p><p className="truncate text-xs text-muted-foreground">{subtitle || 'No details'}</p></div>
        <span onClick={(event) => event.stopPropagation()}><RowActions card={card} onEdit={onEdit} /></span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-2xl bg-accent/40 px-3 py-2 text-xs">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">This month</p><p className="font-display text-base font-extrabold text-coral tabular-nums">{currency.format(spend.month)}</p></div>
        <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">All time</p><p className="font-display text-base font-bold tabular-nums">{currency.format(spend.total)}<span className="ml-1 text-[10px] font-medium text-muted-foreground">· {spend.count}</span></p></div>
      </div>
      <BenefitChips benefits={benefits} />
      {card.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{card.note}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span><ActiveStatus card={card} /></span>
        {hasDetails && <button type="button" onClick={(event) => { event.stopPropagation(); onToggle() }} className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-accent">
          {sub ? <SubChip sub={sub} compact /> : <span>{benefits.length} credit{benefits.length === 1 ? '' : 's'}</span>}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>}
      </div>
      {expanded && (sub || benefits.length > 0) && <>{sub && <SubTracker card={card} sub={sub} />}<BenefitTracker benefits={benefits} onEdit={onEditBenefit} /></>}
    </div>
    {selected && <CardActionBar card={card} onSpend={onSpend} onViewExpenses={onViewExpenses} onAddBenefit={onAddBenefit} />}
  </div>
}

function ActiveStatus({ card }: { card: CardRow }) {
  return <Badge variant={card.active ? 'success' : 'outline'}>{card.active ? 'Active' : 'Inactive'}</Badge>
}

function RowActions({ card, onEdit }: { card: CardRow; onEdit: (card: CardRow) => void }) {
  const deleteCard = useDeleteCard()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  return <div className="flex justify-end gap-1">
    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => onEdit(card)} aria-label={`Edit ${card.name}`}><Pencil className="h-4 w-4" /></Button>
    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)} disabled={deleteCard.isPending} aria-label={`Delete ${card.name}`}><Trash2 className="h-4 w-4" /></Button>
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
  const { t } = useLanguage()
  const [form, setForm] = React.useState<CardForm>(emptyCard)
  const [showSub, setShowSub] = React.useState(false)
  const isExisting = !!card

  React.useEffect(() => {
    if (open) setForm(card ? {
      name: card.name,
      product: card.product,
      issuer: card.issuer,
      last4: card.last4,
      active: card.active,
      note: card.note,
      annualFee: card.annualFee,
      subRequired: card.subRequired,
      subStart: card.subStart,
      subPeriodMonths: monthsBetweenISO(card.subStart, card.subDeadline),
      subBonus: card.subBonus,
    } : emptyCard())
    if (open) setShowSub(card ? Boolean(card.subRequired || card.subDeadline || card.subBonus) : false)
  }, [open, card])

  const subDeadlinePreview = form.subStart && form.subPeriodMonths > 0 ? addMonthsISO(form.subStart, form.subPeriodMonths) : ''

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedBonus = form.subBonus.trim()
    const subRequired = Number(form.subRequired) || 0
    const subStart = form.subStart || ''
    const subPeriodMonths = Number(form.subPeriodMonths) || 0
    // Open date is useful even without SUB tracking; only the bonus-specific
    // fields are cleared when the SUB window is incomplete.
    const hasWindow = subRequired > 0 && subStart && subPeriodMonths > 0
    const subDeadline = hasWindow ? addMonthsISO(subStart, subPeriodMonths) : ''
    const payload = {
      name: form.name.trim(),
      product: form.product.trim() || cardProductName(form.name),
      issuer: form.issuer.trim(),
      last4: form.last4.trim(),
      active: form.active,
      note: form.note.trim(),
      annualFee: Number(form.annualFee) || 0,
      subRequired: hasWindow ? subRequired : 0,
      subStart,
      subDeadline,
      subBonus: hasWindow ? trimmedBonus : '',
    }
    if (!payload.name) return toast({ title: t('card.nameRequired', 'Card name is required.'), variant: 'destructive' })
    try {
      if (isExisting && card) await updateCard.mutateAsync({ ...payload, rowIndex: card.rowIndex })
      else await addCard.mutateAsync(payload)
      toast({ title: isExisting ? t('card.cardUpdated', 'Card updated') : t('card.cardAdded', 'Card added') })
      onOpenChange(false)
    } catch (error) {
      toast({ title: t('card.saveCardError', 'Could not save card'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const saving = addCard.isPending || updateCard.isPending
  const formId = 'card-form'
  return <Dialog open={open} onOpenChange={onOpenChange} title={isExisting ? t('card.editTitle', 'Edit card') : t('card.addTitle', 'Add card')} description={t('card.description', 'Save card options to the Cards tab in Google Sheets.')} mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('expense.cancel', 'Cancel')}</Button><Button type="submit" form={formId} disabled={saving}>{saving ? t('expense.saving', 'Saving...') : (isExisting ? t('expense.saveChanges', 'Save changes') : t('card.addCard', 'Add card'))}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('card.name', 'Name')}<Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Chase Sapphire" /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Product<Input value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value })} placeholder={form.name ? cardProductName(form.name) : 'Amex Platinum'} /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('card.issuer', 'Issuer')}<Input value={form.issuer} onChange={(event) => setForm({ ...form, issuer: event.target.value })} placeholder="Chase" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('card.last4', 'Last4')}<Input inputMode="numeric" maxLength={4} value={form.last4} onChange={(event) => setForm({ ...form, last4: event.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1234" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('card.annualFee', 'Annual fee')}<Input inputMode="decimal" type="number" min="0" step="0.01" value={form.annualFee || ''} onChange={(event) => setForm({ ...form, annualFee: event.target.value === '' ? 0 : Number(event.target.value) })} placeholder="0" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('card.openDate', 'Open date')}<Input className="min-w-0 max-w-full appearance-none" type="date" value={form.subStart} onChange={(event) => setForm({ ...form, subStart: event.target.value })} /></label>
      <label className="flex items-center gap-3 rounded-3xl border border-border/70 bg-white/70 p-3 text-sm font-semibold text-muted-foreground dark:bg-card/70 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-coral" />{t('card.active', 'Active')}</label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('card.note', 'Note')}<Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={t('card.notePlaceholder', 'Benefits, reminders...')} /></label>

      <div className="rounded-3xl border border-border/70 bg-accent/15 sm:col-span-2">
        <button type="button" onClick={() => setShowSub((v) => !v)} className="flex w-full items-center justify-between gap-2 rounded-3xl px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:bg-accent/30" aria-expanded={showSub}>
          <span className="flex items-center gap-2">🎁 Sign-up bonus tracking <span className="text-xs font-medium text-muted-foreground">(optional)</span></span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showSub && 'rotate-180')} />
        </button>
        {showSub && <div className="border-t border-border/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Target spend<Input inputMode="decimal" type="number" min="0" step="100" value={form.subRequired || ''} onChange={(event) => setForm({ ...form, subRequired: event.target.value === '' ? 0 : Number(event.target.value) })} placeholder="4000" /></label>
            <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Period (mo)<Input inputMode="numeric" type="number" min="0" max="36" step="1" value={form.subPeriodMonths || ''} onChange={(event) => setForm({ ...form, subPeriodMonths: event.target.value === '' ? 0 : Number(event.target.value) })} placeholder="3" /></label>
            <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Bonus<Input value={form.subBonus} onChange={(event) => setForm({ ...form, subBonus: event.target.value })} placeholder="60,000 points" /></label>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {subDeadlinePreview ? <>Deadline: <span className="font-semibold text-foreground">{subDeadlinePreview}</span></> : 'Fill open date above, target spend and period to enable SUB tracking.'}
          </p>
        </div>}
      </div>
    </form>
  </Dialog>
}

type BenefitForm = {
  benefit: string
  amount: number
  period: CardBenefitPeriod
  category: string
  matcher: string
  startDate: string
  endDate: string
  active: boolean
}

function emptyBenefit(startDate?: string): BenefitForm {
  return { benefit: '', amount: 0, period: 'monthly', category: '', matcher: '', startDate: startDate || format(new Date(), 'yyyy-MM-dd'), endDate: '', active: true }
}

function benefitFormFromRow(benefit: CardBenefit): BenefitForm {
  return { benefit: benefit.benefit, amount: benefit.amount, period: benefit.period, category: benefit.category, matcher: benefit.matcher, startDate: benefit.startDate, endDate: benefit.endDate, active: benefit.active }
}

function BenefitDialog({ open, onOpenChange, card, benefit }: { open: boolean; onOpenChange: (open: boolean) => void; card: CardRow | null; benefit: CardBenefit | null }) {
  const addBenefit = useAddCardBenefit()
  const updateBenefit = useUpdateCardBenefit()
  const { toast } = useToast()
  const [form, setForm] = React.useState<BenefitForm>(() => emptyBenefit())
  const cardName = card ? (card.product || cardProductName(card.name)) : benefit?.card || ''
  const isEditing = !!benefit

  React.useEffect(() => {
    if (open) setForm(benefit ? benefitFormFromRow(benefit) : emptyBenefit(card?.subStart))
  }, [open, benefit, card?.subStart])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cardName) return
    const payload = {
      card: cardName.trim(),
      benefit: form.benefit.trim(),
      amount: Number(form.amount) || 0,
      period: form.period,
      category: form.category.trim(),
      matcher: form.matcher.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      active: form.active,
    }
    if (!payload.benefit) return toast({ title: 'Benefit name is required.', variant: 'destructive' })
    if (payload.amount <= 0) return toast({ title: 'Benefit amount must be greater than 0.', variant: 'destructive' })
    try {
      if (benefit) await updateBenefit.mutateAsync({ rowIndex: benefit.rowIndex, benefit: payload })
      else await addBenefit.mutateAsync(payload)
      toast({ title: benefit ? 'Benefit updated' : 'Benefit added' })
      onOpenChange(false)
    } catch (error) {
      toast({ title: benefit ? 'Could not update benefit' : 'Could not add benefit', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const formId = 'benefit-form'
  const saving = addBenefit.isPending || updateBenefit.isPending
  return <Dialog open={open} onOpenChange={onOpenChange} title={isEditing ? 'Edit benefit' : 'Add benefit'} description="Save a card credit to the CardBenefits tab in Google Sheets." mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form={formId} disabled={saving}>{saving ? 'Saving...' : (isEditing ? 'Save changes' : 'Add benefit')}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-3xl border border-border/70 bg-accent/30 px-4 py-3 text-sm sm:col-span-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Product template</p>
        <p className="mt-0.5 truncate font-semibold text-foreground">{cardName || 'Selected card'}</p>
      </div>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">Benefit name<Input required value={form.benefit} onChange={(event) => setForm({ ...form, benefit: event.target.value })} placeholder="Dining Credit" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">Amount<Input required inputMode="decimal" type="number" min="0" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value === '' ? 0 : Number(event.target.value) })} placeholder="25" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">Period
        <Select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as CardBenefitPeriod })}>
          {benefitPeriods.map((period) => <option key={period} value={period}>{period}</option>)}
        </Select>
      </label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">Category<Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Dining" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">Merchant / tag<Input value={form.matcher} onChange={(event) => setForm({ ...form, matcher: event.target.value })} placeholder="Resy, hotel, airline" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">Start date<Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">End date<Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
      <label className="flex items-center gap-3 rounded-3xl border border-border/70 bg-white/70 p-3 text-sm font-semibold text-muted-foreground dark:bg-card/70 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-coral" />Active</label>
    </form>
  </Dialog>
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <Card className="mx-auto max-w-2xl border-dashed bg-gradient-to-br from-coral/10 to-peach/10"><CardContent className="pt-7 text-center"><WalletCards className="mx-auto h-10 w-10 text-coral" /><h2 className="mt-3 font-display text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</CardContent></Card>
}
