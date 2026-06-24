import * as React from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { ExpenseDialog, ReturnDialog } from '../components/expenses/ExpenseDialog'
import { Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { useExpenses } from '../hooks/useExpenses'
import { useLanguage } from '../hooks/useLanguage'
import { categoryColor, categoryIcon, currency, displayDate, filterByDateRange, getPresetRange, groupTotals, sumExpenses } from '../lib/format'
import type { Expense } from '../lib/types'

export function OverviewPage() {
  const navigate = useNavigate()
  const { data = [], isLoading, error, refetch } = useExpenses()
  const { t } = useLanguage()
  const outlet = useOutletContext<{ openExpenseDialog: () => void }>()
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [editingReturn, setEditingReturn] = React.useState<Expense | null>(null)
  if (isLoading) return <SkeletonCards />
  if (error) return <QueryError error={error} onRetry={() => { void refetch() }} />
  const thisMonth = filterByDateRange(data, getPresetRange('thisMonth').start, getPresetRange('thisMonth').end)
  const lastMonth = filterByDateRange(data, getPresetRange('lastMonth').start, getPresetRange('lastMonth').end)
  const thisTotal = sumExpenses(thisMonth)
  const lastTotal = sumExpenses(lastMonth)
  const delta = lastTotal ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0
  const top = groupTotals(thisMonth, 'category').filter((item) => item.total > 0).slice(0, 5)
  const recent = [...data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
  const kpis = [
    { label: t('expenses.thisMonth', 'This month'), emoji: '💸', value: currency.format(thisTotal), tint: 'from-coral/15 to-peach/20', href: '/analytics?tab=category&preset=thisMonth' },
    { label: t('expenses.lastMonth', 'Last month'), emoji: '📆', value: currency.format(lastTotal), tint: 'from-lavender/15 to-sky/15', href: '/analytics?tab=category&preset=lastMonth' },
    { label: t('overview.delta', 'Δ vs last'), emoji: delta >= 0 ? '↗️' : '↘️', value: `${delta.toFixed(1)}%`, icon: delta >= 0 ? ArrowUp : ArrowDown, tint: delta >= 0 ? 'from-rose/15 to-coral/10' : 'from-mint/15 to-sage/15', href: '/analytics?tab=trend&preset=thisYear' },
    { label: t('overview.transactions', 'Transactions'), emoji: '🧾', value: String(thisMonth.length), tint: 'from-sky/15 to-lavender/10', href: '/expenses?preset=thisMonth&from=overview' },
  ]
  return <div className="relative space-y-5 md:space-y-7"><div className="soft-blob left-1/3 top-0 hidden h-64 w-64 bg-peach/25 md:block" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">{kpis.map((item) => <button type="button" key={item.label} className="min-w-0 rounded-3xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]" onClick={() => navigate(item.href)} aria-label={`${item.label}: ${item.value}`}><Card className={`h-full min-w-0 bg-gradient-to-br ${item.tint}`}><CardHeader className="pb-2 md:pb-3"><CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground md:text-sm"><span>{item.emoji}</span>{item.label}</CardTitle></CardHeader><CardContent><div className="flex min-w-0 items-center gap-1.5 font-display text-xl font-extrabold md:text-3xl">{item.icon && <item.icon className={delta >= 0 ? 'h-4 w-4 text-rose md:h-5 md:w-5' : 'h-4 w-4 text-mint md:h-5 md:w-5'} />}<span className="truncate">{item.value}</span></div></CardContent></Card></button>)}</div>
    <div className="grid gap-5 lg:grid-cols-2 lg:gap-6"><Card className="min-w-0"><CardHeader><CardTitle>{t('overview.topCategories', 'Top categories this month')}</CardTitle></CardHeader><CardContent className="space-y-4">{top.length ? top.map((item) => { const color = categoryColor(item.name); const width = thisTotal > 0 ? Math.min(100, Math.max(4, (item.total / thisTotal) * 100)) : 4; return <div key={item.name} className="min-w-0 space-y-2"><div className="flex min-w-0 justify-between gap-3 text-sm"><span className="truncate font-semibold">{item.name}</span><span className="shrink-0 text-muted-foreground">{currency.format(item.total)}</span></div><div className="h-3 w-full overflow-hidden rounded-full bg-muted"><div className="h-3 rounded-full bg-gradient-to-r from-coral to-peach" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color.hex}, #FFB199)` }} /></div></div> }) : <EmptyState text={t('expenses.empty', '🌱 Nothing here yet — add your first expense!')} />}<Button variant="outline" className="w-full sm:w-auto" onClick={() => outlet.openExpenseDialog()}><Plus className="h-4 w-4" />{t('overview.quickAdd', 'Quick add')}</Button></CardContent></Card>
    <Card className="min-w-0"><CardHeader><CardTitle>{t('overview.recentExpenses', 'Recent expenses')}</CardTitle></CardHeader><CardContent><div className="divide-y divide-border/70">{recent.map((expense) => { const color = categoryColor(expense.category); const Icon = categoryIcon(expense.category); return <button key={expense.rowIndex} className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-coral/5 motion-safe:active:scale-[0.99]" onClick={() => expense.amount < 0 ? setEditingReturn(expense) : setEditing(expense)}><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>{Icon ? <Icon className="h-5 w-5" strokeWidth={2.2} /> : (expense.category || '?').slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold">{expense.description || expense.category}</p><p className="truncate text-xs text-muted-foreground">{displayDate(expense.date)} · {expense.paymentMethod || t('expenses.unknown', 'Unknown')}</p></div></div><p className="shrink-0 font-display font-bold text-coral">{currency.format(expense.amount)}</p></button> })}{!recent.length && <EmptyState text={t('expenses.empty', '🌱 Nothing here yet — add your first expense!')} />}</div></CardContent></Card></div>{editing && <ExpenseDialog open onOpenChange={(open) => !open && setEditing(null)} expense={editing} />}{editingReturn && <ReturnDialog open onOpenChange={(open) => !open && setEditingReturn(null)} returnExpense={editingReturn} />}</div>
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-3xl border border-dashed bg-accent/40 p-6 text-center text-sm text-muted-foreground">{text}</div> }
