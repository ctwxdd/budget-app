import * as React from 'react'
import { ArrowDownUp, Check, Filter, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import type { DatePreset, Expense } from '../../lib/types'
import { categoryColor, currency, displayDate, filterByDateRange, getPresetRange, sumExpenses } from '../../lib/format'
import { cn } from '../../lib/utils'
import { Badge, Button, Card, Dialog, Input, Select } from '../ui'
import { useCategories, useDeleteExpense, usePaymentMethods } from '../../hooks/useExpenses'
import { useToast } from '../ui/Toast'

export type ExpenseFilters = { preset: DatePreset; start: string; end: string; categories: string[]; payments: string[]; reimbursement: string; search: string }
export const defaultFilters: ExpenseFilters = { preset: 'thisMonth', start: '', end: '', categories: [], payments: [], reimbursement: 'All', search: '' }

type SortKey = 'date' | 'amount'
type FilterKey = keyof ExpenseFilters

function ColorBadge({ value, variant = 'category', className = '' }: { value: string; variant?: 'category' | 'payment'; className?: string }) {
  const color = categoryColor(`${variant}:${value}`)
  return <span className={`inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-3 py-1 align-middle text-xs font-semibold ${className}`} style={{ backgroundColor: color.bg, color: color.text, borderColor: color.border }} title={value}>{value}</span>
}

function MultiSelect({ label, values, options, onChange }: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  const [choice, setChoice] = React.useState('')
  return <div className="space-y-2"><div className="flex gap-2"><Select aria-label={label} value={choice} onChange={(event) => { const value = event.target.value; setChoice(''); if (value && !values.includes(value)) onChange([...values, value]) }}><option value="">{label}</option>{options.map((option) => <option key={option}>{option}</option>)}</Select>{values.length > 0 && <Button type="button" variant="ghost" onClick={() => onChange([])}>Clear</Button>}</div>{values.length > 0 && <div className="flex flex-wrap gap-1.5">{values.map((value) => <button key={value} onClick={() => onChange(values.filter((item) => item !== value))}><Badge variant="secondary">{value} ×</Badge></button>)}</div>}</div>
}

export function applyExpenseFilters(expenses: Expense[], filters: ExpenseFilters) {
  const range = getPresetRange(filters.preset, filters.start, filters.end)
  return filterByDateRange(expenses, range.start, range.end).filter((expense) => {
    if (filters.categories.length && !filters.categories.includes(expense.category)) return false
    if (filters.payments.length && !filters.payments.includes(expense.paymentMethod)) return false
    if (filters.reimbursement === 'Reimbursed' && expense.reimbursement !== 'Reimbursed') return false
    if (filters.reimbursement === 'Pending' && expense.reimbursement !== 'Pending') return false
    if (filters.reimbursement === 'None' && expense.reimbursement) return false
    if (filters.search && !expense.description.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })
}

function FilterFields({ filters, onChange }: { filters: ExpenseFilters; onChange: (filters: ExpenseFilters) => void }) {
  const categories = useCategories()
  const payments = usePaymentMethods()
  return <div className="grid gap-3 lg:grid-cols-5">
    <Select value={filters.preset} onChange={(event) => onChange({ ...filters, preset: event.target.value as DatePreset })}><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="all">All</option><option value="custom">Custom</option></Select>
    {filters.preset === 'custom' ? <div className="grid grid-cols-2 gap-2 lg:col-span-2"><Input type="date" value={filters.start} onChange={(event) => onChange({ ...filters, start: event.target.value })} /><Input type="date" value={filters.end} onChange={(event) => onChange({ ...filters, end: event.target.value })} /></div> : <Input className="lg:col-span-2" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} />}
    {filters.preset === 'custom' && <Input className="lg:col-span-2" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} />}
    <div className="lg:col-span-2"><MultiSelect label="Categories" values={filters.categories} options={categories} onChange={(categories) => onChange({ ...filters, categories })} /></div>
    <div className="lg:col-span-2"><MultiSelect label="Payment methods" values={filters.payments} options={payments} onChange={(payments) => onChange({ ...filters, payments })} /></div>
  </div>
}

function filterChips(filters: ExpenseFilters) {
  const chips: { key: FilterKey; label: string; value?: string }[] = []
  if (filters.search) chips.push({ key: 'search', label: `Search: ${filters.search}` })
  if (filters.preset === 'custom') chips.push({ key: 'preset', label: `Custom: ${filters.start || '…'}–${filters.end || '…'}` })
  filters.categories.forEach((value) => chips.push({ key: 'categories', label: value, value }))
  filters.payments.forEach((value) => chips.push({ key: 'payments', label: value, value }))
  return chips
}

export function ExpenseFilterBar({ filters, onChange, selectionMode = false, selectedCount = 0, onEnterSelectionMode, onCancelSelection }: { filters: ExpenseFilters; onChange: (filters: ExpenseFilters) => void; selectionMode?: boolean; selectedCount?: number; onEnterSelectionMode?: () => void; onCancelSelection?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const chips = filterChips(filters)
  const clearChip = (chip: { key: FilterKey; value?: string }) => {
    if (chip.key === 'categories') onChange({ ...filters, categories: filters.categories.filter((item) => item !== chip.value) })
    else if (chip.key === 'payments') onChange({ ...filters, payments: filters.payments.filter((item) => item !== chip.value) })
    else if (chip.key === 'preset') onChange({ ...filters, preset: 'thisMonth', start: '', end: '' })
    else onChange({ ...filters, search: '' })
  }
  return <>
    <Card className="sticky top-20 z-20 hidden p-4 backdrop-blur md:block"><FilterFields filters={filters} onChange={onChange} /></Card>
    <div className="sticky top-16 z-20 space-y-3 rounded-3xl border bg-card/95 p-3 shadow-soft backdrop-blur md:hidden">
      <div className="flex gap-2">
        <Select value={filters.preset} onChange={(event) => onChange({ ...filters, preset: event.target.value as DatePreset })} aria-label="Date preset"><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="all">All</option><option value="custom">Custom</option></Select>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}><Filter className="h-4 w-4" />Filters</Button>
        {onEnterSelectionMode && <Button type="button" variant={selectionMode ? 'secondary' : 'outline'} onClick={selectionMode ? onCancelSelection : onEnterSelectionMode}>{selectionMode ? 'Cancel' : 'Select'}{selectedCount > 0 && selectionMode ? ` (${selectedCount})` : ''}</Button>}
      </div>
      {chips.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{chips.map((chip) => <button key={`${chip.key}-${chip.label}`} className="shrink-0" onClick={() => clearChip(chip)}><Badge variant="secondary">{chip.label} <X className="ml-1 inline h-3 w-3" /></Badge></button>)}</div>}
    </div>
    <Dialog open={open} onOpenChange={setOpen} title="Filters" description="Narrow expenses without crowding your phone screen." mobileBottomSheet>
      <div className="space-y-4"><FilterFields filters={filters} onChange={onChange} /><div className="sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl md:-mx-7 md:-mb-8 md:pb-4"><Button className="w-full" onClick={() => setOpen(false)}>Show results</Button></div></div>
    </Dialog>
  </>
}

function SelectAllCheckbox({ checked, indeterminate, disabled, onChange }: { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return <input ref={ref} type="checkbox" aria-label="Select all visible expenses" className="h-4 w-4 rounded border-input accent-coral" checked={checked} disabled={disabled} onChange={onChange} onClick={(event) => event.stopPropagation()} />
}

function ExpenseCard({ expense, onEdit, onRemove, selected, selectionMode, onToggleSelected, onEnterSelectionMode }: { expense: Expense; onEdit: (expense: Expense) => void; onRemove: (expense: Expense) => void; selected: boolean; selectionMode: boolean; onToggleSelected: (expense: Expense) => void; onEnterSelectionMode: (expense: Expense) => void }) {
  const [open, setOpen] = React.useState(false)
  const color = categoryColor(expense.category)
  const timerRef = React.useRef<number | null>(null)
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = React.useRef(false)

  const clearLongPress = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const onTouchStart = (event: React.TouchEvent) => {
    if (selectionMode) return
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    longPressFiredRef.current = false
    timerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true
      setOpen(false)
      onEnterSelectionMode(expense)
    }, 500)
  }
  const onTouchMove = (event: React.TouchEvent) => {
    const start = touchStartRef.current
    if (!start) return
    const touch = event.touches[0]
    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) clearLongPress()
  }
  const onCardClick = () => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    if (selectionMode) onToggleSelected(expense)
    else onEdit(expense)
  }

  return <div
    className={cn('relative min-w-0 rounded-3xl border bg-card p-4 shadow-soft transition', selected && 'border-coral/40 bg-coral/10 ring-1 ring-coral/20')}
    onClick={onCardClick}
    onTouchStart={onTouchStart}
    onTouchMove={onTouchMove}
    onTouchEnd={clearLongPress}
    onTouchCancel={clearLongPress}
  >
    {selected && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-coral text-white shadow-soft"><Check className="h-4 w-4" /></span>}
    <div className="flex min-w-0 items-start justify-between gap-3 pr-7"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>{(expense.category || '?').slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{expense.description || 'No description'}</p><p className="text-sm text-muted-foreground">{displayDate(expense.date)}</p></div></div><p className="shrink-0 whitespace-nowrap font-display text-lg font-extrabold text-coral">{currency.format(expense.amount)}</p></div>
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2"><div className="min-w-0 max-w-[45%]"><ColorBadge value={expense.category || 'Uncategorized'} /></div><div className="min-w-0 max-w-[55%]"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></div>{!selectionMode && <div className="ml-auto"><Button variant="ghost" size="icon" aria-label={open ? 'Close expense actions' : 'Open expense actions'} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}><MoreHorizontal className="h-5 w-5" /></Button></div>}</div>
    {open && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3" onClick={(event) => event.stopPropagation()}>
      <Button variant="secondary" className="w-full" onClick={() => { setOpen(false); onEdit(expense) }}><Pencil className="h-4 w-4" />Edit</Button>
      <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setOpen(false); onRemove(expense) }}><Trash2 className="h-4 w-4" />Delete</Button>
    </div>}
  </div>
}

export function ExpenseTable({ expenses, onEdit, selectedIds, selectionMode, onToggleSelected, onSelectMany, onEnterSelectionMode }: { expenses: Expense[]; onEdit: (expense: Expense) => void; selectedIds: Set<number>; selectionMode: boolean; onToggleSelected: (expense: Expense) => void; onSelectMany: (expenses: Expense[], selected: boolean) => void; onEnterSelectionMode: (expense: Expense) => void }) {
  const [sortKey, setSortKey] = React.useState<SortKey>('date')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const [page, setPage] = React.useState(1)
  const deleteExpense = useDeleteExpense()
  const { toast } = useToast()
  const sorted = React.useMemo(() => [...expenses].sort((a, b) => { const result = sortKey === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount; return sortDir === 'asc' ? result : -result }), [expenses, sortKey, sortDir])
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = sorted.slice((page - 1) * pageSize, page * pageSize)
  const selectedVisibleCount = sorted.filter((expense) => selectedIds.has(expense.rowIndex)).length
  const allVisibleSelected = sorted.length > 0 && selectedVisibleCount === sorted.length
  const partiallyVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < sorted.length
  React.useEffect(() => setPage(1), [expenses.length])
  const toggleSort = (key: SortKey) => { setSortDir(sortKey === key && sortDir === 'desc' ? 'asc' : 'desc'); setSortKey(key) }
  const remove = async (expense: Expense) => { if (!window.confirm(`Delete ${expense.description || 'this expense'}?`)) return; try { await deleteExpense.mutateAsync(expense); toast({ title: 'Expense deleted' }) } catch (error) { toast({ title: 'Could not delete expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' }) } }

  return <Card className="overflow-hidden">
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[740px] text-sm">
        <thead className="bg-gradient-to-r from-coral/10 to-peach/10 text-left"><tr>
          <th className="w-12 p-4"><SelectAllCheckbox checked={allVisibleSelected} indeterminate={partiallyVisibleSelected} disabled={!sorted.length} onChange={() => onSelectMany(sorted, !allVisibleSelected)} /></th>
          <th className="p-4"><button className="flex items-center gap-1" onClick={() => toggleSort('date')}>Date <ArrowDownUp className="h-3 w-3" /></button></th>
          <th className="p-4 text-right"><button className="ml-auto flex items-center gap-1" onClick={() => toggleSort('amount')}>Amount <ArrowDownUp className="h-3 w-3" /></button></th>
          <th className="p-4">Description</th><th className="p-4">Category</th><th className="p-4">Payment</th><th className="p-4 text-right">Actions</th>
        </tr></thead>
        <tbody>{current.map((expense) => {
          const selected = selectedIds.has(expense.rowIndex)
          return <tr key={expense.rowIndex} className={cn('border-t transition hover:bg-coral/5', selected && 'bg-coral/10')} onClick={() => onEdit(expense)}>
            <td className="p-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${expense.description || 'expense'}`} className="h-4 w-4 rounded border-input accent-coral" checked={selected} onChange={() => onToggleSelected(expense)} /></td>
            <td className="whitespace-nowrap p-4">{displayDate(expense.date)}</td>
            <td className="p-4 text-right font-display font-bold text-coral">{currency.format(expense.amount)}</td>
            <td className="p-4">{expense.description || <span className="text-muted-foreground">No description</span>}</td>
            <td className="p-4"><ColorBadge value={expense.category || 'Uncategorized'} /></td>
            <td className="p-4"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></td>
            <td className="p-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(expense)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(expense)}><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="grid gap-3 p-3 md:hidden">{current.map((expense) => <ExpenseCard key={expense.rowIndex} expense={expense} onEdit={onEdit} onRemove={remove} selected={selectedIds.has(expense.rowIndex)} selectionMode={selectionMode} onToggleSelected={onToggleSelected} onEnterSelectionMode={onEnterSelectionMode} />)}</div>
    {current.length === 0 && <div className="p-8 text-center md:p-12"><div className="mx-auto max-w-sm rounded-3xl border border-dashed bg-accent/40 p-6 text-muted-foreground">🌱 Nothing here yet — add your first expense!<br />尚無資料</div></div>}
    <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {sorted.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} · Total {currency.format(sumExpenses(sorted))}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>
  </Card>
}
