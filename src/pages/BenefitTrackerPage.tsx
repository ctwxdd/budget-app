import * as React from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { BenefitDialog } from '../components/benefits/BenefitDialog'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Dialog, Input, Select, Textarea, useToast } from '../components/ui'
import { QueryError } from '../components/layout/QueryError'
import { SkeletonCards } from '../components/layout/Skeletons'
import { useAddBenefitCredit, useBenefitCredits, useCreateBenefitCreditsTab, useUpdateBenefitCredit } from '../hooks/useBenefitCredits'
import { useCardBenefits, useDeleteCardBenefit } from '../hooks/useCardBenefits'
import { useCards } from '../hooks/useCards'
import { useExpenses } from '../hooks/useExpenses'
import { useLanguage } from '../hooks/useLanguage'
import { applyBenefitCredits, calculateBenefitUsages, cardBenefitWalletMatcher, expandCardBenefitsForCards, isCertificateBenefit, type BenefitUsage, type CardBenefit, type CardBenefitCredit } from '../lib/cardBenefits'
import { dateToIsoDate, localDateFromIso, todayIso } from '../lib/dates'
import { currency } from '../lib/format'

function monthKeyFromIso(iso: string) {
  return iso.slice(0, 7)
}

function monthEndIso(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return dateToIsoDate(new Date(year, month, 0))
}

function shiftMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split('-').map(Number)
  return dateToIsoDate(new Date(year, month - 1 + delta, 1)).slice(0, 7)
}

function formatMonthLabel(monthKey: string) {
  const date = localDateFromIso(`${monthKey}-01`)
  return date ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : monthKey
}

function certificateLabel(value: number, t: (key: string, fallback: string) => string) {
  const count = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
  return `${count} ${value === 1 ? t('benefits.certificateSingular', 'certificate') : t('benefits.certificatePlural', 'certificates')}`
}

function benefitValueLabel(benefit: CardBenefit, value: number, t: (key: string, fallback: string) => string) {
  return isCertificateBenefit(benefit) ? certificateLabel(value, t) : currency.format(value)
}

function benefitUsageValueLabel(usage: BenefitUsage, value: number, t: (key: string, fallback: string) => string) {
  return benefitValueLabel(usage.benefit, value, t)
}

function benefitValueSummary(usages: BenefitUsage[], select: (usage: BenefitUsage) => number, t: (key: string, fallback: string) => string) {
  const cash = usages.filter((usage) => !isCertificateBenefit(usage.benefit)).reduce((sum, usage) => sum + select(usage), 0)
  const certificates = usages.filter((usage) => isCertificateBenefit(usage.benefit)).reduce((sum, usage) => sum + select(usage), 0)
  return [
    cash ? currency.format(cash) : '',
    certificates ? certificateLabel(certificates, t) : '',
  ].filter(Boolean).join(' · ') || currency.format(0)
}

function daysUntil(end: string) {
  const endDate = localDateFromIso(end)
  const today = localDateFromIso(todayIso())
  if (!endDate || !today) return Number.POSITIVE_INFINITY
  return Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
}

function benefitStatus(usage: BenefitUsage, t: (key: string, fallback: string) => string) {
  if ((usage.pendingCreditAmount || 0) > 0) return { key: 'pending', label: t('benefits.pending', 'Pending'), className: 'bg-sky/20 text-blue-700 dark:text-sky', Icon: Clock3 }
  if (usage.remaining <= 0.005) return { key: 'done', label: t('benefits.done', 'Done'), className: 'bg-mint/15 text-emerald-700 dark:text-mint', Icon: CheckCircle2 }
  if (daysUntil(usage.end) <= 30) return { key: 'expiring', label: t('benefits.expiringSoon', 'Expiring'), className: 'bg-butter/30 text-amber-700 dark:text-butter', Icon: AlertTriangle }
  return { key: 'open', label: t('benefits.open', 'Open'), className: 'bg-accent text-muted-foreground', Icon: Clock3 }
}

function groupStatus(usages: BenefitUsage[], t: (key: string, fallback: string) => string) {
  const statuses = usages.map((usage) => benefitStatus(usage, t))
  return statuses.find((status) => status.key === 'pending') ||
    statuses.find((status) => status.key === 'expiring') ||
    (statuses.every((status) => status.key === 'done') ? statuses[0] : statuses.find((status) => status.key === 'open')) ||
    statuses[0]
}

function BenefitStatusPill({ status }: { status: ReturnType<typeof benefitStatus> }) {
  const Icon = status.Icon
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${status.className}`}>
    <Icon className="h-3 w-3" />{status.label}
  </span>
}

function AttentionStatusPill({ status }: { status: ReturnType<typeof benefitStatus> }) {
  return status.key === 'pending' || status.key === 'expiring' ? <BenefitStatusPill status={status} /> : null
}

export function BenefitTrackerPage() {
  const { data = [], isLoading, error, refetch } = useExpenses()
  const cardBenefits = useCardBenefits()
  const benefitCredits = useBenefitCredits()
  const createCreditsTab = useCreateBenefitCreditsTab()
  const cardsQuery = useCards()
  const { t } = useLanguage()
  const currentMonth = React.useMemo(() => monthKeyFromIso(todayIso()), [])
  const [selectedMonth, setSelectedMonth] = React.useState(currentMonth)
  const selectedIso = React.useMemo(() => monthEndIso(selectedMonth), [selectedMonth])
  const activeCards = React.useMemo(() => cardsQuery.cards.filter((card) => card.active), [cardsQuery.cards])
  const effectiveBenefits = React.useMemo(() => expandCardBenefitsForCards(cardBenefits.benefits, activeCards), [cardBenefits.benefits, activeCards])
  const benefitUsages = React.useMemo(() => calculateBenefitUsages(effectiveBenefits, data, selectedIso)
    .map((usage) => applyBenefitCredits(usage, benefitCredits.credits))
    .sort((a, b) => a.end.localeCompare(b.end) || b.remaining - a.remaining || a.benefit.card.localeCompare(b.benefit.card)),
  [effectiveBenefits, data, selectedIso, benefitCredits.credits])
  const [creditUsage, setCreditUsage] = React.useState<BenefitUsage | null>(null)
  const [creditRow, setCreditRow] = React.useState<CardBenefitCredit | null>(null)
  const [benefitDialogOpen, setBenefitDialogOpen] = React.useState(false)
  const [editingBenefit, setEditingBenefit] = React.useState<CardBenefit | null>(null)
  const productNames = React.useMemo(() => Array.from(new Set(
    [
      ...activeCards.map((card) => (card.product || card.name).trim()),
      ...cardBenefits.benefits.map((benefit) => benefit.card.trim()),
    ].filter(Boolean),
  )).sort((a, b) => a.localeCompare(b)), [activeCards, cardBenefits.benefits])
  const cardProductByName = React.useMemo(() => new Map(activeCards.map((card) => [
    card.name.trim().toLocaleLowerCase(),
    (card.product || card.name).trim(),
  ])), [activeCards])
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
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t('benefits.title', 'Benefit tracker')}</CardTitle>
            <CardDescription>{t('benefits.description', 'Track credits by product, then see every active card using it.')}</CardDescription>
          </div>
          {!cardBenefits.tabMissing && <Button type="button" size="sm" onClick={() => { setEditingBenefit(null); setBenefitDialogOpen(true) }} className="rounded-full"><Plus className="h-4 w-4" />{t('benefits.add', 'Add benefit')}</Button>}
        </div>
        {!cardBenefits.tabMissing && <div className="w-full">
          <div className="flex h-10 w-full items-center justify-between rounded-full border border-border bg-card p-1 shadow-sm">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.previous', 'Previous')} onClick={() => setSelectedMonth((month) => shiftMonthKey(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <button type="button" className="flex-1 rounded-full px-3 text-center text-xs font-extrabold" onClick={() => setSelectedMonth(currentMonth)}>{formatMonthLabel(selectedMonth)}</button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.next', 'Next')} onClick={() => setSelectedMonth((month) => shiftMonthKey(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>}
      </CardHeader>
      <CardContent><BenefitProgressList usages={benefitUsages} benefitByRow={benefitByRow} cardProductByName={cardProductByName} tabMissing={cardBenefits.tabMissing} creditsDisabled={benefitCredits.tabMissing} onAddBenefit={() => { setEditingBenefit(null); setBenefitDialogOpen(true) }} onEditBenefit={editBenefit} onEditCredit={(usage, credit) => { setCreditUsage(usage); setCreditRow(credit || null) }} /></CardContent>
    </Card>
    <BenefitDialog open={benefitDialogOpen} onOpenChange={(open) => { setBenefitDialogOpen(open); if (!open) setEditingBenefit(null) }} benefit={editingBenefit} productName={editingBenefit?.card || ''} productOptions={productNames} />
    {creditUsage && <BenefitCreditDialog open usage={creditUsage} credit={creditRow} onOpenChange={(open) => { if (!open) { setCreditUsage(null); setCreditRow(null) } }} />}
  </div>
}

function EmptyBenefits({ onAddBenefit }: { onAddBenefit: () => void }) {
  const { t } = useLanguage()
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">
    <div>
      <p>{t('benefits.empty', 'No active benefits to track yet.')}</p>
      <Button type="button" size="sm" className="mt-3 rounded-full" onClick={onAddBenefit}><Plus className="h-4 w-4" />{t('benefits.add', 'Add benefit')}</Button>
    </div>
  </div>
}

function BenefitActionsMenu({ benefit, label, open, disabled, onOpenChange, onEdit, onDelete }: { benefit?: CardBenefit; label: string; open: boolean; disabled?: boolean; onOpenChange: (open: boolean) => void; onEdit: (benefit: CardBenefit) => void; onDelete: (benefit: CardBenefit) => void }) {
  const { t } = useLanguage()
  React.useEffect(() => {
    if (!open) return
    const close = () => onOpenChange(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open, onOpenChange])
  if (!benefit) return null
  return <div className="relative z-50" onClick={(event) => event.stopPropagation()}>
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} aria-label={t('benefits.actionsFor', `Actions for ${label}`)} aria-expanded={open} onClick={() => onOpenChange(!open)}><MoreHorizontal className="h-4 w-4" /></Button>
    {open && <div className="absolute right-0 z-[80] mt-1 w-36 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-2xl">
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-accent" onClick={() => { onOpenChange(false); onEdit(benefit) }}><Pencil className="h-4 w-4" />{t('common.edit', 'Edit')}</button>
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10" onClick={() => { onOpenChange(false); onDelete(benefit) }}><Trash2 className="h-4 w-4" />{t('common.delete', 'Delete')}</button>
    </div>}
  </div>
}

function benefitGroupMeta(usage: BenefitUsage, benefitByRow: Map<number, CardBenefit>) {
  const template = benefitByRow.get(usage.benefit.rowIndex) || usage.benefit
  const wallet = cardBenefitWalletMatcher(template)
  const name = template.benefit || usage.benefit.benefit || 'Benefit'
  if (wallet) return {
    key: `wallet||${wallet.toLocaleLowerCase()}||${name.toLocaleLowerCase()}||${template.period}`,
    name,
    product: `Wallet: ${wallet}`,
    benefit: template,
  }
  return {
    key: `${template.card}||${name}`,
    name,
    product: template.card || usage.benefit.card,
    benefit: template,
  }
}

function benefitCardRows(items: BenefitUsage[]) {
  return Array.from(items.reduce((map, usage) => {
    map.set(usage.benefit.card, [...(map.get(usage.benefit.card) || []), usage])
    return map
  }, new Map<string, BenefitUsage[]>()).entries())
    .map(([card, usages]) => ({
      card,
      usages,
      primary: usages.find((usage) => usage.creditRows?.length) || usages[0],
      used: usages.reduce((sum, usage) => sum + usage.used, 0),
      amount: usages.reduce((sum, usage) => sum + usage.benefit.amount, 0),
      remaining: usages.reduce((sum, usage) => sum + usage.remaining, 0),
      creditAmount: usages.reduce((sum, usage) => sum + (usage.creditAmount || 0), 0),
      pendingCreditAmount: usages.reduce((sum, usage) => sum + (usage.pendingCreditAmount || 0), 0),
      start: usages.reduce((min, usage) => usage.start < min ? usage.start : min, usages[0]?.start || ''),
      end: usages.reduce((max, usage) => usage.end > max ? usage.end : max, usages[0]?.end || ''),
    }))
    .sort((a, b) => a.card.localeCompare(b.card))
}

function BenefitProgressList({ usages, benefitByRow, cardProductByName, tabMissing, creditsDisabled, onAddBenefit, onEditBenefit, onEditCredit }: { usages: BenefitUsage[]; benefitByRow: Map<number, CardBenefit>; cardProductByName: Map<string, string>; tabMissing: boolean; creditsDisabled: boolean; onAddBenefit: () => void; onEditBenefit: (benefit: CardBenefit) => void; onEditCredit: (usage: BenefitUsage, credit?: CardBenefitCredit) => void }) {
  const deleteBenefit = useDeleteCardBenefit()
  const { t } = useLanguage()
  const [confirmBenefit, setConfirmBenefit] = React.useState<CardBenefit | null>(null)
  const [view, setView] = React.useState<'benefit' | 'card'>('benefit')
  const [collapsed, setCollapsed] = React.useState<Set<string> | null>(null)
  const [collapsedCards, setCollapsedCards] = React.useState<Set<string> | null>(null)
  const [cardSearch, setCardSearch] = React.useState('')
  const [openActionKey, setOpenActionKey] = React.useState('')
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
    <p className="font-extrabold">{t('benefits.setupTitle', 'Add a CardBenefits tab to track card credits here.')}</p>
    <p className="mt-1 text-muted-foreground">{t('benefits.setupDescription', 'Columns: Product, Benefit, Amount, Period, Category, Merchant/Tag, Start Date, End Date, Active.')}</p>
  </div>
  if (!usages.length) return <EmptyBenefits onAddBenefit={onAddBenefit} />
  const totalLeft = benefitValueSummary(visibleUsages, (usage) => usage.remaining, t)
  const totalUsed = benefitValueSummary(visibleUsages, (usage) => usage.used, t)
  const groups = Array.from(visibleUsages.reduce((map, usage) => {
    const meta = benefitGroupMeta(usage, benefitByRow)
    map.set(meta.key, [...(map.get(meta.key) || []), usage])
    return map
  }, new Map<string, BenefitUsage[]>()).entries())
    .map(([key, items]) => {
      const meta = items[0] ? benefitGroupMeta(items[0], benefitByRow) : { name: 'Benefit', product: '', benefit: undefined }
      return {
        key,
        name: meta.name,
        product: meta.product,
        items: items.sort((a, b) => a.benefit.card.localeCompare(b.benefit.card)),
        benefit: meta.benefit,
        used: items.reduce((sum, usage) => sum + usage.used, 0),
        left: items.reduce((sum, usage) => sum + usage.remaining, 0),
        amount: items.reduce((sum, usage) => sum + usage.benefit.amount, 0),
      }
    })
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
  const cardProductGroups = Array.from(cardGroups.reduce((map, group) => {
    const product = cardProductByName.get(group.card.trim().toLocaleLowerCase()) || group.card
    map.set(product, [...(map.get(product) || []), group])
    return map
  }, new Map<string, typeof cardGroups>()).entries())
    .map(([product, cards]) => ({
      product,
      cards,
      items: cards.flatMap((group) => group.items),
      used: cards.reduce((sum, group) => sum + group.used, 0),
      left: cards.reduce((sum, group) => sum + group.left, 0),
    }))
    .sort((a, b) => b.left - a.left || a.product.localeCompare(b.product))
  const toggleGroup = (key: string) => setCollapsed((current) => {
    const next = new Set(current ?? groups.map((group) => group.key))
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const isGroupCollapsed = (key: string) => collapsed?.has(key) ?? true
  const toggleCard = (card: string) => setCollapsedCards((current) => {
    const next = new Set(current ?? cardGroups.map((group) => group.card))
    next.has(card) ? next.delete(card) : next.add(card)
    return next
  })
  const isCardCollapsed = (card: string) => collapsedCards?.has(card) ?? true
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <BenefitKpi label={t('benefits.tracked', 'Tracked')} value={String(groups.length)} />
      <BenefitKpi label={t('benefits.usedPeriod', 'Used')} value={totalUsed} />
      <BenefitKpi label={t('benefits.leftPeriod', 'Left')} value={totalLeft} />
    </div>
    <Input value={cardSearch} onChange={(event) => setCardSearch(event.target.value)} placeholder={t('benefits.searchCards', 'Search cards...')} autoComplete="off" />
    <div className="grid h-10 grid-cols-2 gap-1 rounded-full bg-accent/60 p-0.5">
      {(['benefit', 'card'] as const).map((mode) => <button key={mode} type="button" className={`rounded-full px-3 text-xs font-extrabold capitalize transition ${view === mode ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/70'}`} onClick={() => setView(mode)}>{mode === 'benefit' ? t('benefits.benefitView', 'Benefit view') : t('benefits.cardView', 'Card view')}</button>)}
    </div>
    {!visibleUsages.length && <div className="rounded-3xl border border-dashed bg-accent/35 p-5 text-center text-sm font-semibold text-muted-foreground">{t('benefits.noMatches', 'No matching cards.')}</div>}
    {visibleUsages.length > 0 && view === 'card' && <div className="space-y-4">
      {cardProductGroups.map((productGroup) => {
        const productStatus = groupStatus(productGroup.items, t)
        return <section key={productGroup.product} className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{productGroup.product}</p>
              <p className="truncate text-[11px] font-semibold text-muted-foreground">{productGroup.cards.length} {productGroup.cards.length === 1 ? t('benefits.cardSingular', 'card') : t('benefits.cardsPlural', 'cards')} · {benefitValueSummary(productGroup.items, (usage) => usage.used, t)} used · {benefitValueSummary(productGroup.items, (usage) => usage.remaining, t)} left</p>
            </div>
            <BenefitStatusPill status={productStatus} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {productGroup.cards.map((group) => {
              const isCollapsed = isCardCollapsed(group.card)
              const status = groupStatus(group.items, t)
              return <div key={group.card} className="rounded-3xl border border-border/70 bg-card shadow-sm">
                <button type="button" className={`flex w-full items-center justify-between gap-2 px-3 py-3 text-left ${isCollapsed ? '' : 'border-b border-border/60'}`} onClick={() => toggleCard(group.card)} aria-expanded={!isCollapsed}>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isCollapsed ? '' : 'rotate-90'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{group.card}</p>
                    <p className="text-[11px] font-semibold text-muted-foreground">{benefitValueSummary(group.items, (usage) => usage.used, t)} used · {benefitValueSummary(group.items, (usage) => usage.remaining, t)} left</p>
                  </div>
                  <BenefitStatusPill status={status} />
                </button>
                {!isCollapsed && <div className="divide-y divide-border/60 px-3">
                {group.items.map((usage) => {
                  const template = benefitByRow.get(usage.benefit.rowIndex) || usage.benefit
                  const credit = usage.creditRows?.[0]
                  const pct = usage.benefit.amount > 0 ? Math.min(100, Math.round((usage.used / usage.benefit.amount) * 100)) : 0
                  const done = usage.remaining <= 0.005
                  const status = benefitStatus(usage, t)
                  return <div key={`${usage.benefit.rowIndex}-${usage.benefit.card}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2"><p className="truncate text-xs font-extrabold">{usage.benefit.benefit}</p><AttentionStatusPill status={status} /></div>
                      <p className="truncate text-[11px] font-semibold text-muted-foreground">{benefitUsageValueLabel(usage, usage.used, t)} / {benefitUsageValueLabel(usage, usage.benefit.amount, t)} · {benefitUsageValueLabel(usage, usage.remaining, t)} {t('benefits.leftShort', 'left')}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(!done || credit) && <Button type="button" variant="secondary" size="sm" className="h-8 rounded-full px-3 text-xs" disabled={creditsDisabled} onClick={() => onEditCredit(usage, credit)}>{credit ? t('common.edit', 'Edit') : t('benefits.usedButton', 'Used')}</Button>}
                      <BenefitActionsMenu benefit={template} label={usage.benefit.benefit} open={openActionKey === `card-${usage.benefit.rowIndex}-${usage.benefit.card}`} disabled={deleteBenefit.isPending} onOpenChange={(open) => setOpenActionKey(open ? `card-${usage.benefit.rowIndex}-${usage.benefit.card}` : '')} onEdit={onEditBenefit} onDelete={setConfirmBenefit} />
                    </div>
                  </div>
                })}
                </div>}
              </div>
            })}
          </div>
        </section>
      })}
    </div>}
    {visibleUsages.length > 0 && view === 'benefit' && <div className="space-y-3">
      {groups.map((group) => {
        const groupPct = group.amount > 0 ? Math.min(100, Math.round((group.used / group.amount) * 100)) : 0
        const isCollapsed = isGroupCollapsed(group.key)
        const status = groupStatus(group.items, t)
        return <div key={group.key} className={`relative overflow-visible rounded-2xl border border-border/70 bg-card shadow-sm ${openActionKey === `benefit-${group.key}` ? 'z-50' : 'z-0'}`}>
          <div className={`border-border/60 bg-accent/20 px-3 py-2 transition sm:px-3.5 ${isCollapsed ? '' : 'border-b'}`}>
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggleGroup(group.key)} aria-expanded={!isCollapsed}>
                <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isCollapsed ? '' : 'rotate-90'}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{group.name}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">{group.product} · {group.items.length} {group.items.length === 1 ? t('benefits.cardSingular', 'card') : t('benefits.cardsPlural', 'cards')} · {benefitValueSummary(group.items, (usage) => usage.remaining, t)} {t('benefits.leftShort', 'left')}</p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <BenefitStatusPill status={status} />
                <p className="hidden text-xs font-extrabold tabular-nums text-muted-foreground sm:block">{benefitValueSummary(group.items, (usage) => usage.used, t)} / {benefitValueSummary(group.items, (usage) => usage.benefit.amount, t)}</p>
                <BenefitActionsMenu benefit={group.benefit} label={group.name} open={openActionKey === `benefit-${group.key}`} disabled={deleteBenefit.isPending} onOpenChange={(open) => setOpenActionKey(open ? `benefit-${group.key}` : '')} onEdit={onEditBenefit} onDelete={setConfirmBenefit} />
              </div>
            </div>
            <button type="button" className="mt-1.5 block w-full" onClick={() => toggleGroup(group.key)} aria-label={group.name}>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${groupPct}%` }} />
              </div>
            </button>
          </div>
          {!isCollapsed && <div>
            {benefitCardRows(group.items).map((row) => {
              const pct = row.amount > 0 ? Math.min(100, Math.round((row.used / row.amount) * 100)) : 0
              const done = row.remaining <= 0.005
              const credit = row.primary.creditRows?.[0]
              const creditLabel = row.creditAmount ? `${t('benefits.received', 'Received')} ${benefitValueLabel(row.primary.benefit, row.creditAmount, t)}` : row.pendingCreditAmount ? `${t('benefits.pending', 'Pending')} ${benefitValueLabel(row.primary.benefit, row.pendingCreditAmount, t)}` : ''
              const status = groupStatus(row.usages, t)
              return <div key={row.card} className="border-b border-border/60 px-3 py-2 last:border-b-0 sm:px-4">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2"><p className="min-w-0 truncate text-sm font-extrabold">{row.card}</p><AttentionStatusPill status={status} /></div>
                  {(!done || credit) && <Button type="button" variant="secondary" size="sm" className="h-7 shrink-0 justify-center rounded-full px-3 text-xs sm:w-auto" disabled={creditsDisabled} onClick={() => onEditCredit(row.primary, credit)}>
                    {credit ? t('common.edit', 'Edit') : t('benefits.usedButton', 'Used')}
                  </Button>}
                </div>
                <div className="mt-1 min-w-0">
                  {creditLabel && <p className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700 dark:text-mint">{creditLabel}</p>}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span className="tabular-nums">{benefitValueLabel(row.primary.benefit, row.used, t)} / {benefitValueLabel(row.primary.benefit, row.amount, t)}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${done ? 'bg-mint/15 text-emerald-700 dark:text-mint' : 'bg-butter/25 text-amber-700 dark:text-butter'}`}>{done ? t('benefits.done', 'Done') : `${benefitValueLabel(row.primary.benefit, row.remaining, t)} ${t('benefits.leftShort', 'left')}`}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{row.start} {'->'} {row.end}{row.usages.length > 1 ? ` · ${row.usages.length} rules` : ''}</p>
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
      title={t('benefits.deleteTitle', `Delete ${confirmBenefit?.benefit || 'benefit'}?`)}
      description={t('benefits.deleteDescription', 'This clears the benefit row from CardBenefits. Matching expenses and manual credits stay unchanged.')}
      confirmLabel={t('common.delete', 'Delete')}
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

function defaultCreditDate(usage: BenefitUsage) {
  const today = todayIso()
  if (today >= usage.start && today <= usage.end) return today
  return usage.end
}

function BenefitCreditDialog({ open, onOpenChange, usage, credit }: { open: boolean; onOpenChange: (open: boolean) => void; usage: BenefitUsage; credit: CardBenefitCredit | null }) {
  const addCredit = useAddBenefitCredit()
  const updateCredit = useUpdateBenefitCredit()
  const { toast } = useToast()
  const { t } = useLanguage()
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
  const certificateBenefit = isCertificateBenefit(usage.benefit)
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
    if (!payload.date || payload.amount <= 0) return toast({ title: t('benefits.creditRequired', 'Date and amount are required.'), variant: 'destructive' })
    try {
      if (credit) await updateCredit.mutateAsync({ rowIndex: credit.rowIndex, credit: payload })
      else await addCredit.mutateAsync(payload)
      toast({ title: credit ? t('benefits.creditUpdated', 'Benefit credit updated') : t('benefits.creditAdded', 'Benefit credit added') })
      onOpenChange(false)
    } catch (error) {
      toast({ title: t('benefits.creditSaveError', 'Could not save benefit credit'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title={credit ? t('benefits.editCreditTitle', 'Edit benefit credit') : t('benefits.markCreditTitle', 'Mark benefit credit')} description={`${usage.benefit.card} · ${usage.benefit.benefit}`} mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('expense.cancel', 'Cancel')}</Button><Button type="submit" form={formId} disabled={saving}>{saving ? t('expense.saving', 'Saving...') : t('benefits.saveCredit', 'Save credit')}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('expense.date', 'Date')}<Input className="min-w-0 max-w-full appearance-none" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{certificateBenefit ? t('benefits.certificates', 'Certificates') : t('benefits.amount', 'Amount')}<Input inputMode={certificateBenefit ? 'numeric' : 'decimal'} type="number" min="0" step={certificateBenefit ? '1' : '0.01'} value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value === '' ? 0 : Number(event.target.value) })} /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('benefits.status', 'Status')}<Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="Received">{t('benefits.received', 'Received')}</option><option value="Pending">{t('benefits.pending', 'Pending')}</option></Select></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('card.note', 'Note')}<Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={t('benefits.creditNotePlaceholder', 'Booking, statement credit, confirmation...')} /></label>
    </form>
  </Dialog>
}
