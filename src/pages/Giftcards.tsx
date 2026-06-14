import * as React from 'react'
import { ChevronDown, Gift, WalletCards } from 'lucide-react'
import { PageErrorBoundary } from '../components/ErrorBoundary'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { SkeletonCards } from '../components/layout/Skeletons'
import { useGiftcards, type GiftcardRow, type MerchantRow } from '../hooks/useGiftcards'
import { currency, displayDate } from '../lib/format'
import { cn } from '../lib/utils'

type GiftcardsView = 'cards' | 'list'
const VIEW_KEY = 'giftcards-view'

export function GiftcardsPage() {
  return <PageErrorBoundary><GiftcardsContent /></PageErrorBoundary>
}

function GiftcardsContent() {
  const { cards, merchants, tabMissing, isLoading, error } = useGiftcards()
  const [expanded, setExpanded] = React.useState<string[]>([])
  const [showInactive, setShowInactive] = React.useState(false)
  const [view, setView] = React.useState<GiftcardsView>(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'
  })

  React.useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  if (isLoading) return <SkeletonCards />
  if (error) return <EmptyState title="Could not load giftcards" text={error.message} />
  if (tabMissing) return <EmptyState title="Set up Giftcard tab in your sheet" text="Giftcard formulas were not found yet. See README.md / template xlsx, then refresh this page." />

  const totalBalance = merchants.length ? sum(merchants, 'balance') : sum(cards, 'balance')
  const totalPurchased = merchants.length ? sum(merchants, 'purchased') : sum(cards, 'face')
  const totalSpent = merchants.length ? sum(merchants, 'spent') : cards.reduce((total, card) => total + card.direct + card.fifo, 0)
  const activeCards = cards.filter((card) => card.balance > 0.005).length
  const merchantRows = [...merchants].sort((a, b) => Number(b.active) - Number(a.active) || b.balance - a.balance || a.merchant.localeCompare(b.merchant))
  const visibleMerchantRows = showInactive ? merchantRows : merchantRows.filter((merchant) => merchant.active || merchant.balance > 0.005)
  const kpis = [
    { label: 'Total balance', emoji: '💰', value: currency.format(totalBalance), tint: 'from-mint/15 to-sage/15' },
    { label: 'Active cards', emoji: '🎁', value: String(activeCards), tint: 'from-coral/15 to-peach/20' },
    { label: 'Purchased', emoji: '🛍️', value: currency.format(totalPurchased), tint: 'from-sky/15 to-lavender/10' },
    { label: 'Spent', emoji: '✨', value: currency.format(totalSpent), tint: 'from-butter/25 to-peach/15' },
  ]

  return <div className="relative space-y-5 md:space-y-7">
    <div className="soft-blob left-1/3 top-0 hidden h-64 w-64 bg-peach/25 md:block" />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Giftcards</h1>
        <p className="text-sm text-muted-foreground">Track balances and spending by card.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground" onClick={() => setShowInactive((current) => !current)}>
          {showInactive ? 'Hide depleted' : 'Show depleted'}
        </button>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-accent/60 p-0.5">
          {(['cards', 'list'] as const).map((mode) => <button key={mode} type="button" className={cn('h-8 rounded-full px-3 text-xs font-semibold capitalize transition', view === mode ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')} onClick={() => setView(mode)}>{mode === 'cards' ? '▦ Cards' : '≣ List'}</button>)}
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">{kpis.map((item) => <Card key={item.label} className={`overflow-hidden rounded-2xl bg-gradient-to-br ${item.tint}`}><CardHeader className="p-3 pb-1 md:p-4 md:pb-1.5"><CardTitle className="flex items-center gap-1.5 text-[11px] text-muted-foreground md:text-xs"><span>{item.emoji}</span>{item.label}</CardTitle></CardHeader><CardContent className="px-3 pb-3 pt-0 md:px-4 md:pb-4"><div className="truncate font-display text-lg font-extrabold md:text-2xl">{item.value}</div></CardContent></Card>)}</div>
    {!merchantRows.length ? <EmptyState title="No giftcards yet" text="Giftcard purchases and balances will appear here after the Giftcard tab formulas produce rows." /> : view === 'list' ? <GiftcardList merchants={visibleMerchantRows} cards={cards} showInactive={showInactive} /> : !visibleMerchantRows.length ? <EmptyState title="No active merchants" text="Use Show depleted to include merchants with no remaining balance." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visibleMerchantRows.map((merchant) => {
        const open = expanded.includes(merchant.merchant)
        const merchantCards = cards.filter((card) => card.vendor === merchant.merchant && (showInactive || card.balance > 0.005)).sort((a, b) => a.date.localeCompare(b.date))
        return <Card key={merchant.merchant} className={cn('overflow-hidden rounded-2xl transition', !merchant.active && 'opacity-70')}>
          <button className="w-full text-left" onClick={() => setExpanded((current) => current.includes(merchant.merchant) ? current.filter((name) => name !== merchant.merchant) : [...current, merchant.merchant])}>
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><CardTitle className="truncate text-base">{merchant.merchant}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{merchant.cardCount} card{merchant.cardCount === 1 ? '' : 's'}</p></div>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
              </div>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3 px-3 pb-3 pt-0 md:px-4 md:pb-4">
              <div className="font-display text-xl font-extrabold text-coral md:text-2xl">{currency.format(merchant.balance)}</div>
              <Badge variant={merchant.active ? 'success' : 'outline'}>{merchant.active ? 'Active' : 'Inactive'}</Badge>
            </CardContent>
          </button>
          {open && <div className="space-y-2 border-t border-border/70 p-2.5 md:p-3">{merchantCards.map((card) => <GiftcardCard key={`${card.card}-${card.date}`} card={card} />)}</div>}
        </Card>
      })}
    </div>}
  </div>
}

function GiftcardCard({ card }: { card: GiftcardRow }) {
  const spent = card.direct + card.fifo
  const percent = card.face ? Math.max(0, Math.min(100, (spent / card.face) * 100)) : 0
  const depleted = card.balance <= 0.005
  return <div className={cn('rounded-2xl border border-border/70 bg-white/70 p-2.5 shadow-sm dark:bg-card/70 md:flex md:items-center md:gap-3', depleted && 'opacity-55')}>
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <Gift className="mt-0.5 hidden h-4 w-4 shrink-0 text-coral sm:block" />
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{card.card}</p><p className="text-xs text-muted-foreground">{displayDate(card.date)}</p></div>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px] text-muted-foreground md:mt-0 md:w-52">
      <Metric label="Face" value={currency.format(card.face)} />
      <Metric label="Spent" value={currency.format(spent)} />
      <Metric label="Paid" value={currency.format(card.paid)} />
    </div>
    <div className="mt-2 min-w-0 md:mt-0 md:w-36">
      <div className="text-right text-sm font-bold text-foreground">{currency.format(card.balance)}</div>
      <ProgressBar percent={percent} className="mt-1" />
    </div>
  </div>
}

function GiftcardList({ merchants, cards, showInactive }: { merchants: MerchantRow[]; cards: GiftcardRow[]; showInactive: boolean }) {
  const [open, setOpen] = React.useState<string[]>([])
  if (!merchants.length) return <EmptyState title="No active merchants" text="Use Show depleted to include merchants with no remaining balance." />
  const toggle = (merchant: string) => setOpen((current) => current.includes(merchant) ? current.filter((name) => name !== merchant) : [...current, merchant])
  return <Card className="overflow-hidden rounded-2xl">
    {merchants.map((merchant) => {
      const isOpen = open.includes(merchant.merchant)
      const merchantCards = cards.filter((card) => card.vendor === merchant.merchant && (showInactive || card.balance > 0.005)).sort((a, b) => a.date.localeCompare(b.date))
      return <div key={merchant.merchant} className="border-b border-border/50 last:border-b-0">
        <button type="button" className={cn('grid w-full grid-cols-[auto_minmax(0,1fr)_8rem] items-center gap-3 px-3 py-2.5 text-left transition hover:bg-accent/40 md:grid-cols-[auto_minmax(0,1fr)_10rem_6.5rem] md:px-4', !merchant.active && 'opacity-70')} onClick={() => toggle(merchant.merchant)}>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', isOpen && 'rotate-180')} />
          <div className="min-w-0"><p className="truncate text-sm font-bold">{merchant.merchant}</p><p className="text-[11px] text-muted-foreground">{merchantCards.length} card{merchantCards.length === 1 ? '' : 's'} · Spent {currency.format(merchant.spent)} / {currency.format(merchant.purchased)}</p></div>
          <div className="hidden md:block"><ProgressBar percent={merchant.purchased ? Math.max(0, Math.min(100, (merchant.spent / merchant.purchased) * 100)) : 0} /></div>
          <div className="text-right"><p className="font-display text-base font-extrabold text-coral md:text-lg">{currency.format(merchant.balance)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{merchant.active ? 'Active' : 'Inactive'}</p></div>
        </button>
        {isOpen && <div className="space-y-1.5 bg-accent/20 p-2 md:p-3">{merchantCards.map((card) => <GiftcardListRow key={`${card.card}-${card.date}`} card={card} />)}</div>}
      </div>
    })}
  </Card>
}

function GiftcardListRow({ card }: { card: GiftcardRow }) {
  const spent = card.direct + card.fifo
  const percent = card.face ? Math.max(0, Math.min(100, (spent / card.face) * 100)) : 0
  const depleted = card.balance <= 0.005
  return <div className={cn('grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 rounded-xl border border-border/60 bg-white/80 px-2.5 py-1.5 text-xs shadow-sm dark:bg-card/60 md:grid-cols-[minmax(0,1fr)_10rem_6.5rem] md:gap-3 md:px-3 md:text-sm', depleted && 'opacity-55')}>
    <div className="min-w-0"><p className="truncate font-semibold">{card.card}</p><p className="text-[10px] text-muted-foreground md:text-[11px]">{displayDate(card.date)} · Face {currency.format(card.face)} · Spent {currency.format(spent)}</p></div>
    <div className="hidden md:block"><ProgressBar percent={percent} /></div>
    <div className="text-right text-sm font-bold text-coral">{currency.format(card.balance)}</div>
  </div>
}

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
  const color = safePercent >= 85 ? 'hsl(8 88% 58%)' : safePercent >= 50 ? 'hsl(38 92% 56%)' : 'hsl(150 55% 45%)'
  return <div className={cn('h-2.5 w-full overflow-hidden rounded-full', className)} style={{ backgroundColor: 'rgba(15, 23, 42, 0.12)' }}>
    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, safePercent)}%`, backgroundColor: color }} />
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-accent/45 px-2 py-1"><span className="block">{label}</span><span className="font-bold text-foreground">{value}</span></div>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <Card className="mx-auto max-w-2xl border-dashed bg-gradient-to-br from-coral/10 to-peach/10"><CardContent className="pt-7 text-center"><WalletCards className="mx-auto h-10 w-10 text-coral" /><h2 className="mt-3 font-display text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></CardContent></Card>
}

function sum<T extends Record<K, number>, K extends keyof T>(rows: T[], key: K) {
  return rows.reduce((total, row) => total + row[key], 0)
}
