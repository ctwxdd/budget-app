import * as React from 'react'
import type { ExpenseFilters } from '../components/expenses/ExpenseTable'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Tabs } from '../components/ui'
import { ExpenseFilterBar, applyExpenseFilters, defaultFilters } from '../components/expenses/ExpenseTable'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { useExpenses } from '../hooks/useExpenses'
import { chartPalette, categoryColor, categoryIcon, currency, groupTotals, monthlyTotals, monthsForYear, sumExpenses } from '../lib/format'

const moneyTick = (value: number) => `$${Math.round(value).toLocaleString()}`
const validYear = (year: number, fallback: number) => (Number.isFinite(year) && year > 0 ? year : fallback)

export function AnalyticsPage() {
  const { data = [], isLoading, error, refetch } = useExpenses()
  const [filters, setFilters] = React.useState<ExpenseFilters>({ ...defaultFilters, preset: 'thisYear' })
  const [tab, setTab] = React.useState('category')
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
  return <div className="space-y-5 md:space-y-6"><ExpenseFilterBar filters={filters} onChange={setFilters} /><Tabs value={tab} onChange={setTab} tabs={[
    { value: 'category', label: 'By Category', content: tab === 'category' ? <Card><CardHeader><CardTitle>Spending by category</CardTitle><CardDescription>A pastel breakdown of where your money went.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2 lg:gap-6">{category.length ? <div className="h-60 md:h-72"><ResponsiveContainer><PieChart><Pie data={category} dataKey="total" nameKey="name" outerRadius="80%" innerRadius="45%" label={category.length <= 10}>{category.map((_, index) => <Cell key={index} fill={chartPalette[index % chartPalette.length]} />)}</Pie><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /></PieChart></ResponsiveContainer></div> : <EmptyChart />}<RankedList rows={category} /></CardContent></Card> : null },
    { value: 'payment', label: 'By Payment', content: tab === 'payment' ? <Card><CardHeader><CardTitle>Spending by payment method</CardTitle><CardDescription>See which cards or accounts carried the load.</CardDescription></CardHeader><CardContent>{payment.length ? <div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={payment} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis type="number" tickFormatter={moneyTick} /><YAxis type="category" dataKey="name" width={90} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Bar dataKey="total" fill={chartPalette[2]} radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'trend', label: 'Monthly Trend', content: tab === 'trend' ? <Card><CardHeader><CardTitle>Monthly trend</CardTitle><CardDescription>Gentle waves make patterns easier to spot.</CardDescription></CardHeader><CardContent>{trend.length ? <div className="h-60 md:h-72"><ResponsiveContainer><AreaChart data={trend}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartPalette[0]} stopOpacity={0.35} /><stop offset="95%" stopColor={chartPalette[0]} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Area type="monotone" dataKey="total" stroke={chartPalette[0]} fill="url(#trendFill)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div> : <EmptyChart />}</CardContent></Card> : null },
    { value: 'year', label: 'Year Compare', content: tab === 'year' ? <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Year compare</CardTitle><CardDescription>Month-by-month bars for two years.</CardDescription></div><div className="grid grid-cols-2 gap-2 md:flex"><Select value={String(safeYearA)} onChange={(event) => setYearA(Number(event.target.value))}>{yearOptionsA.map((year) => <option key={year}>{year}</option>)}</Select><Select value={String(safeYearB)} onChange={(event) => setYearB(Number(event.target.value))}>{yearOptionsB.map((year) => <option key={year}>{year}</option>)}</Select></div></div></CardHeader><CardContent><div className="h-60 md:h-72"><ResponsiveContainer><BarChart data={yearCompare}><CartesianGrid strokeDasharray="3 3" stroke="#F0EAE5" /><XAxis dataKey="month" /><YAxis tickFormatter={moneyTick} /><Tooltip formatter={(value: unknown) => currency.format(Number(value || 0))} /><Legend /><Bar dataKey={String(safeYearA)} fill={chartPalette[0]} radius={[10, 10, 0, 0]} /><Bar dataKey={String(safeYearB)} fill={chartPalette[3]} radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card> : null },
  ]} /></div>
}

function EmptyChart() {
  return <div className="grid h-60 place-items-center rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-muted-foreground md:h-72">🌱 Nothing here yet — add your first expense!<br />尚無資料</div>
}

function RankedList({ rows }: { rows: { name: string; total: number }[] }) {
  const total = sumExpenses(rows.map((row, index) => ({ rowIndex: index, date: '', amount: row.total, description: '', category: '', paymentMethod: '', reimbursement: '' })))
  if (rows.length === 0) return <EmptyChart />
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1
  return <ul className="divide-y divide-border/60 overflow-hidden rounded-3xl border bg-white/70 dark:bg-card/70">
    {rows.map((row) => {
      const Icon = categoryIcon(row.name)
      const color = categoryColor(row.name)
      const pct = total ? (row.total / total) * 100 : 0
      const barPct = (row.total / max) * 100
      return <li key={row.name} className="relative px-3 py-2.5 sm:px-4">
        <span aria-hidden className="absolute inset-y-0 left-0 -z-0 rounded-r-full opacity-20" style={{ width: `${barPct}%`, backgroundColor: color.hex }} />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ backgroundColor: color.bg, color: color.text }}>
            {Icon ? <Icon className="h-4 w-4" strokeWidth={2.2} /> : (row.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={row.name}>{row.name}</p>
            <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
          </div>
          <p className="shrink-0 font-display text-sm font-bold tabular-nums text-coral sm:text-base">{currency.format(row.total)}</p>
        </div>
      </li>
    })}
  </ul>
}
