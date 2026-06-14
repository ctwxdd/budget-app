import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ExpenseFilters } from '../components/expenses/ExpenseTable'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts'
import type { PieSectorShapeProps } from 'recharts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Tabs } from '../components/ui'
import { ExpenseFilterBar, applyExpenseFilters, defaultFilters } from '../components/expenses/ExpenseTable'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { useExpenses } from '../hooks/useExpenses'
import { chartPalette, categoryColor, categoryIcon, currency, groupTotals, monthlyTotals, monthsForYear } from '../lib/format'

const moneyTick = (value: number) => `$${Math.round(value).toLocaleString()}`
const validYear = (year: number, fallback: number) => (Number.isFinite(year) && year > 0 ? year : fallback)

export function AnalyticsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data = [], isLoading, error, refetch } = useExpenses()
  const requestedPreset = searchParams.get('preset') as ExpenseFilters['preset'] | null
  const initialPreset = requestedPreset && ['thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'].includes(requestedPreset) ? requestedPreset : 'thisYear'
  const requestedTab = searchParams.get('tab')
  const initialTab = requestedTab && ['category', 'payment', 'trend', 'year'].includes(requestedTab) ? requestedTab : 'category'
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
  const category = groupTotals(filtered, 'category')
  const payment = groupTotals(filtered, 'paymentMethod')
  const trend = monthlyTotals(filtered)
  const compareA = monthsForYear(safeYearA, data)
  const compareB = monthsForYear(safeYearB, data)
  const yearCompare = compareA.map((item, index) => ({ month: item.month, [String(safeYearA)]: item.value, [String(safeYearB)]: compareB[index]?.value ?? 0 }))
  const yearOptionsA = [currentYear, ...years].filter((v, i, a) => a.indexOf(v) === i)
  const yearOptionsB = [currentYear - 1, ...years].filter((v, i, a) => a.indexOf(v) === i)
  return <div className="space-y-5 md:space-y-6"><ExpenseFilterBar filters={filters} onChange={setFilters} mobileSticky={false} desktopSticky={false} /><Tabs value={tab} onChange={setTab} tabs={[
    { value: 'category', label: 'By Category', content: tab === 'category' ? <Card className="overflow-visible"><CardHeader><CardTitle>Spending by category</CardTitle><CardDescription>Tap a category to focus, then view its matching expenses.</CardDescription></CardHeader><CardContent>{category.length ? <CategoryBreakdown rows={category} onOpenExpenses={(categoryName) => {
      const params = new URLSearchParams({ category: categoryName, preset: filters.preset, from: 'analytics' })
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      navigate(`/expenses?${params.toString()}`)
    }} /> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'payment', label: 'By Payment', content: tab === 'payment' ? <Card><CardHeader><CardTitle>Spending by payment method</CardTitle><CardDescription>See which cards or accounts carried the load.</CardDescription></CardHeader><CardContent>{payment.length ? <div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={payment} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis type="number" tickFormatter={moneyTick} /><YAxis type="category" dataKey="name" width={90} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Bar dataKey="total" fill={chartPalette[2]} radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'trend', label: 'Monthly Trend', content: tab === 'trend' ? <Card><CardHeader><CardTitle>Monthly trend</CardTitle><CardDescription>Gentle waves make patterns easier to spot.</CardDescription></CardHeader><CardContent>{trend.length ? <div className="h-60 md:h-72"><ResponsiveContainer><AreaChart data={trend}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartPalette[0]} stopOpacity={0.35} /><stop offset="95%" stopColor={chartPalette[0]} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Area type="monotone" dataKey="total" stroke={chartPalette[0]} fill="url(#trendFill)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'year', label: 'Year Compare', content: tab === 'year' ? <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Year compare</CardTitle><CardDescription>Month-by-month bars for two years.</CardDescription></div><div className="grid grid-cols-2 gap-2 md:flex"><Select value={String(safeYearA)} onChange={(event) => setYearA(Number(event.target.value))}>{yearOptionsA.map((year) => <option key={year}>{year}</option>)}</Select><Select value={String(safeYearB)} onChange={(event) => setYearB(Number(event.target.value))}>{yearOptionsB.map((year) => <option key={year}>{year}</option>)}</Select></div></div></CardHeader><CardContent><div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={yearCompare}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Legend /><Bar dataKey={String(safeYearA)} fill={chartPalette[0]} radius={[10, 10, 0, 0]} /><Bar dataKey={String(safeYearB)} fill={chartPalette[3]} radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card> : null },
  ]} /></div>
}

function EmptyChart() {
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">🌱 Nothing here yet — add your first expense!<br />尚無資料</div>
}

const RADIAN = Math.PI / 180

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
    fillOpacity={isActive ? 1 : 0.24}
    stroke="hsl(var(--card))"
    strokeWidth={isActive ? 3 : 1.5}
    style={{ filter: isActive ? 'drop-shadow(0 7px 8px rgba(42,36,56,0.18))' : 'none', transition: 'opacity 180ms ease, filter 180ms ease' }}
  />
}

function CategoryBreakdown({ rows, onOpenExpenses }: { rows: { name: string; total: number }[]; onOpenExpenses: (category: string) => void }) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  React.useEffect(() => { if (selectedIndex >= rows.length) setSelectedIndex(0) }, [rows.length, selectedIndex])
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const selected = rows[selectedIndex] || rows[0]
  const Icon = categoryIcon(selected.name)
  const color = categoryColor(selected.name)
  const percentage = total ? (selected.total / total) * 100 : 0

  return <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 mx-auto h-64 w-full max-w-sm rounded-3xl bg-card/95 shadow-[0_14px_26px_-24px_hsl(var(--foreground)/0.45)] backdrop-blur-xl md:top-24 md:h-80">
      <div className="relative h-full">
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
              isAnimationActive="auto"
              shape={(props, index) => <DonutSector {...props} isActive={index === selectedIndex} />}
              onClick={(_, index) => setSelectedIndex(index)}
            >
              {rows.map((_, index) => <Cell key={index} fill={chartPalette[index % chartPalette.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex max-w-32 flex-col items-center text-center">
            <span className="mb-1.5 grid h-9 w-9 place-items-center rounded-full" style={{ backgroundColor: color.bg, color: color.text }}>{Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} /> : selected.name.slice(0, 1).toUpperCase()}</span>
            <p className="max-w-full truncate text-sm font-bold" title={selected.name}>{selected.name}</p>
            <p className="mt-0.5 font-display text-base font-extrabold tabular-nums" style={{ color: color.text }}>{currency.format(selected.total)}</p>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{percentage.toFixed(1)}% of total</p>
          </div>
        </div>
      </div>
    </div>
    <RankedList rows={rows} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onOpenExpenses={onOpenExpenses} />
  </div>
}

function RankedList({ rows, selectedIndex, onSelect, onOpenExpenses }: { rows: { name: string; total: number }[]; selectedIndex: number; onSelect: (index: number) => void; onOpenExpenses: (category: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (rows.length === 0) return <EmptyChart />
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1
  return <ul className="space-y-2">
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
