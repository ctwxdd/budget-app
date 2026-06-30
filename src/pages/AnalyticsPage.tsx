import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts'
import type { PieSectorShapeProps } from 'recharts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Tabs } from '../components/ui'
import { ExpenseFilterBar } from '../components/expenses/ExpenseTable'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { useExpenses } from '../hooks/useExpenses'
import { useCardBenefits } from '../hooks/useCardBenefits'
import { useCards } from '../hooks/useCards'
import { useLanguage } from '../hooks/useLanguage'
import { calculateBenefitUsage, expandCardBenefitsForCards, type BenefitUsage } from '../lib/cardBenefits'
import { chartPalette, categoryColor, categoryIcon, currency, groupTotals, monthlyTotals, monthsForYear } from '../lib/format'
import { groupTagTotals } from '../lib/tags'
import { applyExpenseFilters, defaultFilters, type ExpenseFilters } from '../lib/expenseFilters'

const moneyTick = (value: number) => `$${Math.round(value).toLocaleString()}`
const validYear = (year: number, fallback: number) => (Number.isFinite(year) && year > 0 ? year : fallback)
const RADIAN = Math.PI / 180

export function AnalyticsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data = [], isLoading, error, refetch } = useExpenses()
  const cardBenefits = useCardBenefits()
  const cardsQuery = useCards()
  const { t } = useLanguage()
  const requestedPreset = searchParams.get('preset') as ExpenseFilters['preset'] | null
  const initialPreset = requestedPreset && ['thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'].includes(requestedPreset) ? requestedPreset : 'thisYear'
  const requestedTab = searchParams.get('tab')
  const initialTab = requestedTab && ['category', 'tag', 'payment', 'benefits', 'trend', 'year'].includes(requestedTab) ? requestedTab : 'category'
  const [filters, setFilters] = React.useState<ExpenseFilters>({ ...defaultFilters, preset: initialPreset })
  const [tab, setTab] = React.useState(initialTab)
  const currentYear = new Date().getFullYear()
  const years = React.useMemo(() => Array.from(new Set(data.map((expense) => Number(expense.date.slice(0, 4))).filter((year) => Number.isFinite(year) && year > 0))).sort((a, b) => b - a), [data])
  const [yearA, setYearA] = React.useState(currentYear)
  const [yearB, setYearB] = React.useState(currentYear - 1)
  const safeYearA = validYear(yearA, currentYear)
  const safeYearB = validYear(yearB, currentYear - 1)
  const filtered = React.useMemo(() => applyExpenseFilters(data, filters), [data, filters])
  if (isLoading) return <SkeletonCards />
  if (error) return <QueryError error={error} onRetry={() => { void refetch() }} />
  const category = groupTotals(filtered, 'category').filter((row) => row.total > 0)
  const tagTotals = groupTagTotals(filtered).filter((row) => row.total > 0)
  const payment = groupTotals(filtered, 'paymentMethod')
  const trend = monthlyTotals(filtered)
  const compareA = monthsForYear(safeYearA, data)
  const compareB = monthsForYear(safeYearB, data)
  const effectiveBenefits = React.useMemo(() => expandCardBenefitsForCards(cardBenefits.benefits, cardsQuery.cards), [cardBenefits.benefits, cardsQuery.cards])
  const benefitUsages = React.useMemo(() => effectiveBenefits
    .map((benefit) => calculateBenefitUsage(benefit, data))
    .filter((usage): usage is BenefitUsage => Boolean(usage))
    .sort((a, b) => a.end.localeCompare(b.end) || b.remaining - a.remaining || a.benefit.card.localeCompare(b.benefit.card)),
  [effectiveBenefits, data])
  const yearCompare = compareA.map((item, index) => ({ month: item.month, [String(safeYearA)]: item.value, [String(safeYearB)]: compareB[index]?.value ?? 0 }))
  const yearOptionsA = [currentYear, ...years].filter((v, i, a) => a.indexOf(v) === i)
  const yearOptionsB = [currentYear - 1, ...years].filter((v, i, a) => a.indexOf(v) === i)
  return <div className="space-y-5 md:space-y-6"><ExpenseFilterBar filters={filters} onChange={setFilters} mobileSticky={false} desktopSticky={false} /><Tabs value={tab} onChange={setTab} tabs={[
    { value: 'category', label: t('analytics.byCategory', 'By Category'), content: tab === 'category' ? <Card className="overflow-visible"><CardHeader><CardTitle>{t('analytics.categoryTitle', 'Spending by category')}</CardTitle><CardDescription>{t('analytics.categoryDescription', 'Tap a category to focus, then view its matching expenses.')}</CardDescription></CardHeader><CardContent>{category.length ? <CategoryBreakdown rows={category} onOpenExpenses={(categoryName) => {
      const params = new URLSearchParams({ category: categoryName, preset: filters.preset, from: 'analytics' })
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      navigate(`/expenses?${params.toString()}`)
    }} /> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'tag', label: t('analytics.byTag', 'By Tag'), content: tab === 'tag' ? <Card className="overflow-visible"><CardHeader><CardTitle>{t('analytics.tagTitle', 'Spending by tag')}</CardTitle><CardDescription>{t('analytics.tagDescription', 'Use tags for trips, projects, people, or anything flexible.')}</CardDescription></CardHeader><CardContent>{tagTotals.length ? <CategoryBreakdown rows={tagTotals} onOpenExpenses={(tagName) => {
      const params = new URLSearchParams({ tag: tagName, preset: filters.preset, from: 'analytics' })
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      navigate(`/expenses?${params.toString()}`)
    }} /> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'payment', label: t('analytics.byPayment', 'By Payment'), content: tab === 'payment' ? <Card><CardHeader><CardTitle>{t('analytics.paymentTitle', 'Spending by payment method')}</CardTitle><CardDescription>{t('analytics.paymentDescription', 'See which cards or accounts carried the load.')}</CardDescription></CardHeader><CardContent>{payment.length ? <div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={payment} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis type="number" tickFormatter={moneyTick} /><YAxis type="category" dataKey="name" width={90} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Bar dataKey="total" fill={chartPalette[2]} radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'benefits', label: 'Benefits', content: tab === 'benefits' ? <Card><CardHeader><CardTitle>Card benefits</CardTitle><CardDescription>Track each benefit first, then see every card using it.</CardDescription></CardHeader><CardContent><BenefitProgressList usages={benefitUsages} tabMissing={cardBenefits.tabMissing} /></CardContent></Card> : null },
    { value: 'trend', label: t('analytics.monthlyTrend', 'Monthly Trend'), content: tab === 'trend' ? <Card><CardHeader><CardTitle>{t('analytics.monthlyTrend', 'Monthly trend')}</CardTitle><CardDescription>{t('analytics.trendDescription', 'Gentle waves make patterns easier to spot.')}</CardDescription></CardHeader><CardContent>{trend.length ? <div className="h-60 md:h-72"><ResponsiveContainer><AreaChart data={trend}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartPalette[0]} stopOpacity={0.35} /><stop offset="95%" stopColor={chartPalette[0]} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Area type="monotone" dataKey="total" stroke={chartPalette[0]} fill="url(#trendFill)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'year', label: t('analytics.yearCompare', 'Year Compare'), content: tab === 'year' ? <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>{t('analytics.yearCompare', 'Year compare')}</CardTitle><CardDescription>{t('analytics.yearDescription', 'Month-by-month bars for two years.')}</CardDescription></div><div className="grid grid-cols-2 gap-2 md:flex"><Select value={String(safeYearA)} onChange={(event) => setYearA(Number(event.target.value))}>{yearOptionsA.map((year) => <option key={year}>{year}</option>)}</Select><Select value={String(safeYearB)} onChange={(event) => setYearB(Number(event.target.value))}>{yearOptionsB.map((year) => <option key={year}>{year}</option>)}</Select></div></div></CardHeader><CardContent><div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={yearCompare}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Legend /><Bar dataKey={String(safeYearA)} fill={chartPalette[0]} radius={[10, 10, 0, 0]} /><Bar dataKey={String(safeYearB)} fill={chartPalette[3]} radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card> : null },
  ]} /></div>
}

function EmptyChart() {
  const { t } = useLanguage()
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">{t('expenses.empty', '🌱 Nothing here yet — add your first expense!')}</div>
}

function BenefitProgressList({ usages, tabMissing }: { usages: BenefitUsage[]; tabMissing: boolean }) {
  if (tabMissing) return <div className="rounded-3xl border border-dashed bg-butter/10 p-5 text-sm">
    <p className="font-extrabold">Add a CardBenefits tab to track card credits here.</p>
    <p className="mt-1 text-muted-foreground">Columns: Product, Benefit, Amount, Period, Category, Merchant/Tag, Start Date, End Date, Active.</p>
  </div>
  if (!usages.length) return <EmptyChart />
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
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <BenefitKpi label="Benefits tracked" value={String(groups.length)} />
      <BenefitKpi label="Used this period" value={currency.format(totalUsed)} />
      <BenefitKpi label="Left this period" value={currency.format(totalLeft)} />
    </div>
    <div className="space-y-3">
      {groups.map((group) => {
        const groupPct = group.amount > 0 ? Math.min(100, Math.round((group.used / group.amount) * 100)) : 0
        return <div key={group.name} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          <div className="border-b border-border/60 bg-accent/25 px-3 py-2.5 sm:px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{group.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{group.items.length} card{group.items.length === 1 ? '' : 's'} · {currency.format(group.left)} left</p>
              </div>
              <p className="shrink-0 text-xs font-extrabold tabular-nums text-muted-foreground">{currency.format(group.used)} / {currency.format(group.amount)}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-mint to-sage" style={{ width: `${groupPct}%` }} />
            </div>
          </div>
          <div>
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
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{usage.start} → {usage.end}</p>
                </div>
              </div>
            })}
          </div>
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

function DonutSector({ isActive, cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, ...props }: PieSectorShapeProps) {
  const offset = isActive ? 8 : 0
  const x = Number(cx) + Math.cos(-Number(midAngle) * RADIAN) * offset
  const y = Number(cy) + Math.sin(-Number(midAngle) * RADIAN) * offset
  return <Sector
    {...props}
    cx={x}
    cy={y}
    innerRadius={Number(innerRadius)}
    outerRadius={Number(outerRadius) + (isActive ? 5 : 0)}
    fillOpacity={isActive ? 1 : 0.72}
    stroke="hsl(var(--card))"
    strokeWidth={isActive ? 3 : 1.5}
    style={{ filter: isActive ? 'drop-shadow(0 9px 10px rgba(42,36,56,0.2))' : 'none', transition: 'opacity 180ms ease, filter 180ms ease' }}
  />
}

function CategoryBreakdown({ rows, onOpenExpenses }: { rows: { name: string; total: number }[]; onOpenExpenses: (category: string) => void }) {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  React.useEffect(() => { if (selectedIndex !== null && selectedIndex >= rows.length) setSelectedIndex(null) }, [rows.length, selectedIndex])
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const selected = selectedIndex === null ? null : rows[selectedIndex] || null
  const Icon = selected ? categoryIcon(selected.name) : null
  const color = selected ? categoryColor(selected.name) : { bg: 'hsl(var(--primary) / 0.12)', text: 'hsl(var(--primary))' }
  const displayName = selected?.name || 'Total'
  const displayAmount = selected?.total ?? total
  const percentage = selected && total ? (selected.total / total) * 100 : 100
  const detailText = selected ? `${percentage.toFixed(1)}%` : `${rows.length} categories`
  const toggleSelectedIndex = React.useCallback((index: number) => {
    setSelectedIndex((current) => current === index ? null : index)
  }, [])

  const stickyRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = stickyRef.current
    if (!el) return
    const mobileQuery = window.matchMedia('(max-width: 767px)')
    // Scroll position drives a *target* progress 0..1 (shrink completes over
    // 100px of scroll right before the element pins, so it tracks the finger
    // while you're actively scrolling). Desktop keeps the full-size donut.
    const PIN_OFFSET = 100
    const RANGE = 100
    // A critically-underdamped spring interpolates the live --p toward the
    // target. Stiffness/damping tuned for one visible overshoot (~6%) then a
    // quick settle — feels "flexy" instead of locked to scroll, and adds a
    // satisfying bounce when scroll velocity changes or stops.
    const STIFFNESS = 0.22
    const DAMPING = 0.74
    let target = 0
    let current = 0
    let velocity = 0
    let raf = 0
    const computeTarget = () => {
      if (!mobileQuery.matches) {
        target = 0
        return
      }
      const top = el.getBoundingClientRect().top
      target = Math.max(0, Math.min(1, (PIN_OFFSET + RANGE - top) / RANGE))
    }
    const tick = () => {
      raf = 0
      const dx = target - current
      velocity = velocity * (1 - DAMPING) + dx * STIFFNESS
      current += velocity
      // Allow a small overshoot past [0, 1] so the spring's natural bounce
      // shows in the visuals (a touch smaller / a touch larger than the rest
      // state). Cap to prevent any runaway.
      if (current < -0.08) current = -0.08
      else if (current > 1.12) current = 1.12
      // Write to a CSS variable so all interpolated styles update without a
      // React re-render — critical for keeping the recharts PieChart out of
      // the per-frame render loop.
      el.style.setProperty('--p', current.toFixed(4))
      if (Math.abs(dx) > 0.0006 || Math.abs(velocity) > 0.0006) {
        raf = requestAnimationFrame(tick)
      } else {
        // Snap to rest so we don't leave sub-pixel residue in the variable.
        current = target
        velocity = 0
        el.style.setProperty('--p', current.toFixed(4))
      }
    }
    const onScroll = () => {
      computeTarget()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onMediaChange = () => {
      target = 0
      current = 0
      velocity = 0
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      el.style.setProperty('--p', '0')
      if (mobileQuery.matches) onScroll()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    mobileQuery.addEventListener('change', onMediaChange)
    computeTarget()
    current = target
    el.style.setProperty('--p', current.toFixed(4))
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      mobileQuery.removeEventListener('change', onMediaChange)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return <div className="grid gap-6 lg:grid-cols-2 lg:items-start" onClick={() => setSelectedIndex(null)}>
    <div
      ref={stickyRef}
      onClick={() => setSelectedIndex(null)}
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 mx-auto h-[calc(16rem-var(--p,0)*9rem)] w-full max-w-[calc(24rem-var(--p,0)*5rem)] overflow-hidden rounded-3xl bg-card/95 shadow-[0_calc(14px+var(--p,0)*6px)_calc(26px+var(--p,0)*8px)_-24px_hsl(var(--foreground)/calc(0.45+var(--p,0)*0.15))] backdrop-blur-xl md:top-24 md:h-[calc(20rem-var(--p,0)*12rem)] md:max-w-[calc(26rem-var(--p,0)*6rem)]"
      style={{ ['--p' as string]: '0' }}
    >
      {/*
        The full chart stays centered when expanded, then shifts left and
        scales down as the card pins. Its center overlay is inside this wrapper
        so the icon remains locked to the donut hole throughout the transform.
      */}
      <div
        className="absolute left-1/2 top-1/2 h-64 w-full md:h-80"
        onClick={(event) => {
          event.stopPropagation()
          setSelectedIndex(null)
        }}
        style={{
          transform: 'translate(calc(-50% - var(--p) * 24%), -50%)',
        }}
      >
        <div
          className="relative h-full w-full origin-center"
          style={{ transform: 'scale(calc(1 - var(--p) * 0.6))' }}
        >
          <ResponsiveContainer>
            <PieChart accessibilityLayer={false}>
              <Pie
                data={rows}
                dataKey="total"
                nameKey="name"
                outerRadius="78%"
                innerRadius="54%"
                paddingAngle={1.5}
                cornerRadius={4}
                isAnimationActive={false}
                shape={(props, index) => <DonutSector {...props} isActive={selectedIndex === index} />}
                onClick={(_, index, event) => {
                  event?.stopPropagation?.()
                  toggleSelectedIndex(index)
                }}
              >
                {rows.map((row) => <Cell key={row.name} fill={categoryColor(row.name).hex} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{ opacity: 'calc(1 - var(--p) * 1.6)' }}
          >
            <div className="flex max-w-[8rem] flex-col items-center text-center">
              <span
                className="grid h-12 w-12 place-items-center rounded-full"
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  boxShadow: '0 0 0 0.25rem hsl(var(--card))',
                }}
              >
                {Icon ? (
                  <Icon className="h-6 w-6" strokeWidth={2.2} />
                ) : (
                  <span className="font-display text-2xl font-extrabold leading-none">
                    {selected ? selected.name.slice(0, 1).toUpperCase() : '$'}
                  </span>
                )}
              </span>
              <div className="mt-1.5 w-full">
                <p className="max-w-full truncate text-sm font-bold" title={displayName}>{displayName}</p>
                <p className="mt-0.5 font-display text-base font-extrabold tabular-nums" style={{ color: color.text }}>{currency.format(displayAmount)}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{detailText}</p>
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{ opacity: 'calc(var(--p) * 1.35)' }}
          >
            <span
              className="grid place-items-center rounded-full"
              style={{
                width: 'calc(3rem + var(--p) * 4rem)',
                height: 'calc(3rem + var(--p) * 4rem)',
                backgroundColor: color.bg,
                color: color.text,
                boxShadow: '0 0 0 calc(0.25rem + var(--p) * 0.5rem) hsl(var(--card))',
              }}
            >
              {Icon ? (
                <span
                  className="grid place-items-center"
                  style={{
                    width: 'calc(1.5rem + var(--p) * 2.25rem)',
                    height: 'calc(1.5rem + var(--p) * 2.25rem)',
                  }}
                >
                  <Icon className="h-full w-full" strokeWidth={2.2} />
                </span>
              ) : (
                <span className="font-display text-2xl font-extrabold leading-none">
                  {selected ? selected.name.slice(0, 1).toUpperCase() : '$'}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex w-[52%] flex-col justify-center pl-2 pr-4 text-right"
        style={{
          opacity: 'calc(var(--p) * 1.25)',
          transform: 'translateX(calc((1 - var(--p)) * 0.75rem))',
        }}
        aria-hidden
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{selected ? 'Selected' : 'All spending'}</p>
        <p className="mt-0.5 truncate text-sm font-bold" title={displayName}>{displayName}</p>
        <p className="font-display text-lg font-extrabold leading-tight tabular-nums" style={{ color: color.text }}>{currency.format(displayAmount)}</p>
        <p className="text-[11px] font-semibold text-muted-foreground">{detailText}</p>
      </div>
    </div>
    <RankedList rows={rows} selectedIndex={selectedIndex} onSelect={toggleSelectedIndex} onOpenExpenses={onOpenExpenses} />
  </div>
}

function RankedList({ rows, selectedIndex, onSelect, onOpenExpenses }: { rows: { name: string; total: number }[]; selectedIndex: number | null; onSelect: (index: number) => void; onOpenExpenses: (category: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (rows.length === 0) return <EmptyChart />
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1
  return <ul className="space-y-2" onClick={(event) => event.stopPropagation()}>
    {rows.map((row, index) => {
      const Icon = categoryIcon(row.name)
      const color = categoryColor(row.name)
      const pct = total ? (row.total / total) * 100 : 0
      const barPct = (row.total / max) * 100
      const selected = index === selectedIndex
      return <li key={row.name} className={`overflow-hidden rounded-3xl border transition duration-200 ${selected ? 'translate-y-[-2px] border-primary/35 bg-primary/[0.08] opacity-100 shadow-lift ring-1 ring-primary/15' : 'border-transparent bg-card/45 opacity-55 hover:opacity-80'}`}>
        <button type="button" aria-pressed={selected} onClick={() => onSelect(index)} className="w-full px-4 py-3.5 text-left sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>
              {Icon ? <Icon className="h-5 w-5" strokeWidth={2.2} /> : (row.name || '?').slice(0, 1).toUpperCase()}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base" title={row.name}>{row.name}</p>
            <div className="shrink-0 text-right"><p className="font-display text-sm font-bold tabular-nums sm:text-base">{currency.format(row.total)}</p><p className="text-xs font-semibold tabular-nums text-muted-foreground">{pct.toFixed(1)}%</p></div>
          </div>
          <div className="ml-[52px] mt-2.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
              <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: color.hex }} />
            </div>
          </div>
        </button>
        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${selected ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} aria-hidden={!selected}>
          <div className="overflow-hidden">
            <div className="border-t border-primary/15 px-4 py-3 sm:px-5">
              <Button type="button" variant="secondary" size="sm" className="w-full" tabIndex={selected ? 0 : -1} onClick={() => onOpenExpenses(row.name)}>
                View expenses
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </li>
    })}
  </ul>
}
