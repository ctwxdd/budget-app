import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Filter, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react'
import type { DatePreset, Expense } from '../../lib/types'
import { categoryColor, categoryIcon, categoryName, currency, displayDate, filterByDateRange, getPresetRange, sumExpenses } from '../../lib/format'
import { cn } from '../../lib/utils'
import { Badge, Button, Card, Dialog, Input, Select } from '../ui'
import { useCategories, useDeleteExpense, usePaymentMethods, useSheetId } from '../../hooks/useExpenses'
import { useToast } from '../ui/Toast'

export type ExpenseFilters = { preset: DatePreset; start: string; end: string; categories: string[]; payments: string[]; reimbursement: string; search: string }
export const defaultFilters: ExpenseFilters = { preset: 'thisMonth', start: '', end: '', categories: [], payments: [], reimbursement: 'All', search: '' }

type SortKey = 'date' | 'amount'
type FilterKey = keyof ExpenseFilters

function ColorBadge({ value, variant = 'category', className = '' }: { value: string; variant?: 'category' | 'payment'; className?: string }) {
  const color = categoryColor(`${variant}:${value}`)
  return <span className={`inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-3 py-1 align-middle text-xs font-semibold ${className}`} style={{ backgroundColor: color.bg, color: color.text, borderColor: color.border }} title={value}>{value}</span>
}

function ReimbursementChip({ value }: { value: string }) {
  const tone = value === 'Reimbursed'
    ? 'border-mint/40 bg-mint/15 text-emerald-700 dark:text-mint'
    : 'border-butter/50 bg-butter/25 text-amber-700 dark:text-butter'
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', tone)} title={`Reimbursement: ${value}`}>{value === 'Reimbursed' ? '✓' : '⌛'} {value}</span>
}

function MultiSelect({ label, values, options, onChange }: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  const [choice, setChoice] = React.useState('')
  return <div className="space-y-2"><div className="flex gap-2"><Select aria-label={label} value={choice} onChange={(event) => { const value = event.target.value; setChoice(''); if (value && !values.includes(value)) onChange([...values, value]) }}><option value="">{label}</option>{options.map((option) => <option key={option}>{option}</option>)}</Select>{values.length > 0 && <Button type="button" variant="ghost" onClick={() => onChange([])}>Clear</Button>}</div>{values.length > 0 && <div className="flex flex-wrap gap-1.5">{values.map((value) => <button key={value} onClick={() => onChange(values.filter((item) => item !== value))}><Badge variant="secondary">{value} ×</Badge></button>)}</div>}</div>
}

function dayLabel(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (iso === todayIso) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  if (iso === yesterdayIso) return 'Yesterday'
  return displayDate(iso)
}

export function applyExpenseFilters(expenses: Expense[], filters: ExpenseFilters) {
  const range = getPresetRange(filters.preset, filters.start, filters.end)
  return filterByDateRange(expenses, range.start, range.end).filter((expense) => {
    if (filters.categories.length && !filters.categories.includes(categoryName(expense.category))) return false
    if (filters.payments.length && !filters.payments.includes(expense.paymentMethod)) return false
    if (filters.reimbursement === 'Reimbursed' && expense.reimbursement !== 'Reimbursed') return false
    if (filters.reimbursement === 'Pending' && expense.reimbursement !== 'Pending') return false
    if (filters.reimbursement === 'None' && expense.reimbursement) return false
    if (filters.search && !expense.description.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })
}

function parseFilterDate(value: string) {
  const date = value ? parseISO(value) : null
  return date && isValid(date) ? date : null
}

function DateRangePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const startDate = parseFilterDate(start)
  const endDate = parseFilterDate(end)
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => startDate || new Date())
  const monthStart = startOfMonth(month)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(endOfMonth(monthStart))
  const days: Date[] = []
  for (let day = calendarStart; day <= calendarEnd; day = addDays(day, 1)) days.push(day)
  const label = startDate
    ? endDate
      ? `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`
      : `${format(startDate, 'MMM d, yyyy')} – Select end`
    : 'Select date range'

  const selectDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd')
    if (!startDate || endDate) {
      onChange(iso, '')
      return
    }
    if (isBefore(day, startDate)) {
      onChange(iso, '')
      return
    }
    onChange(start, iso)
    setOpen(false)
  }

  return <div className="relative min-w-0 lg:col-span-2">
    <Button type="button" variant="outline" className="w-full justify-start overflow-hidden px-4 font-normal" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </Button>
    {open && <div className="mt-2 rounded-3xl border border-border bg-card p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <p className="font-display text-sm font-bold">{format(monthStart, 'MMMM yyyy')}</p>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="py-1">{day.slice(0, 1)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const isStart = Boolean(startDate && isSameDay(day, startDate))
          const isEnd = Boolean(endDate && isSameDay(day, endDate))
          const inRange = Boolean(startDate && endDate && !isBefore(day, startDate) && !isBefore(endDate, day))
          return <button
            key={format(day, 'yyyy-MM-dd')}
            type="button"
            aria-label={format(day, 'MMMM d, yyyy')}
            aria-pressed={isStart || isEnd}
            onClick={() => selectDay(day)}
            className={cn('mx-auto grid h-9 w-9 place-items-center rounded-full text-sm transition', !isSameMonth(day, monthStart) && 'text-muted-foreground/45', inRange && 'bg-primary/15', (isStart || isEnd) && 'bg-primary font-bold text-primary-foreground shadow-soft')}
          >{format(day, 'd')}</button>
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
        <p className="text-xs text-muted-foreground">{startDate && !endDate ? 'Now choose an end date' : 'Choose a start and end date'}</p>
        {(start || end) && <Button type="button" variant="ghost" size="sm" onClick={() => onChange('', '')}>Clear</Button>}
      </div>
    </div>}
  </div>
}

function FilterFields({ filters, onChange, showSearch = true }: { filters: ExpenseFilters; onChange: (filters: ExpenseFilters) => void; showSearch?: boolean }) {
  const categories = useCategories()
  const payments = usePaymentMethods()
  return <div className="grid gap-3 lg:grid-cols-5">
    <Select value={filters.preset} onChange={(event) => onChange({ ...filters, preset: event.target.value as DatePreset })}><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="all">All</option><option value="custom">Custom</option></Select>
    {filters.preset === 'custom' ? <DateRangePicker start={filters.start} end={filters.end} onChange={(start, end) => onChange({ ...filters, start, end })} /> : showSearch ? <Input className="lg:col-span-2" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} /> : <div className="hidden lg:col-span-2" />}
    {filters.preset === 'custom' && showSearch && <Input className="lg:col-span-2" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} />}
    <div className="lg:col-span-2"><MultiSelect label="Categories" values={filters.categories} options={categories} onChange={(categories) => onChange({ ...filters, categories })} /></div>
    <div className="lg:col-span-2"><MultiSelect label="Payment methods" values={filters.payments} options={payments} onChange={(payments) => onChange({ ...filters, payments })} /></div>
  </div>
}

function filterChips(filters: ExpenseFilters) {
  const chips: { key: FilterKey; label: string; value?: string }[] = []
  if (filters.preset === 'custom') chips.push({ key: 'preset', label: `Custom: ${filters.start || '…'}–${filters.end || '…'}` })
  filters.categories.forEach((value) => chips.push({ key: 'categories', label: value, value }))
  filters.payments.forEach((value) => chips.push({ key: 'payments', label: value, value }))
  return chips
}

export function ExpenseFilterBar({ filters, onChange, selectionMode = false, selectedCount = 0, onEnterSelectionMode, onCancelSelection, mobileSticky = true, desktopSticky = true }: { filters: ExpenseFilters; onChange: (filters: ExpenseFilters) => void; selectionMode?: boolean; selectedCount?: number; onEnterSelectionMode?: () => void; onCancelSelection?: () => void; mobileSticky?: boolean; desktopSticky?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const chips = filterChips(filters)
  const clearChip = (chip: { key: FilterKey; value?: string }) => {
    if (chip.key === 'categories') onChange({ ...filters, categories: filters.categories.filter((item) => item !== chip.value) })
    else if (chip.key === 'payments') onChange({ ...filters, payments: filters.payments.filter((item) => item !== chip.value) })
    else if (chip.key === 'preset') onChange({ ...filters, preset: 'thisMonth', start: '', end: '' })
    else onChange({ ...filters, search: '' })
  }
  return <>
    <Card className={`${desktopSticky ? 'sticky top-20 z-20' : ''} hidden p-4 backdrop-blur md:block`}><FilterFields filters={filters} onChange={onChange} /></Card>
    <div className={`${mobileSticky ? 'sticky top-16 z-20' : ''} space-y-3 rounded-3xl border bg-card/95 p-3 shadow-soft backdrop-blur md:hidden`}>
      <div className="flex gap-2">
        <Select value={filters.preset} onChange={(event) => onChange({ ...filters, preset: event.target.value as DatePreset })} aria-label="Date preset"><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="all">All</option><option value="custom">Custom</option></Select>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}><Filter className="h-4 w-4" />Filters</Button>
        {onEnterSelectionMode && <Button type="button" variant={selectionMode ? 'secondary' : 'outline'} onClick={selectionMode ? onCancelSelection : onEnterSelectionMode}>{selectionMode ? 'Cancel' : 'Select'}{selectedCount > 0 && selectionMode ? ` (${selectedCount})` : ''}</Button>}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 pr-10" type="search" inputMode="search" enterKeyHint="search" aria-label="Search expense descriptions" placeholder="Search expenses..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} />
        {filters.search && <button type="button" aria-label="Clear search" onClick={() => onChange({ ...filters, search: '' })} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>
      {chips.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{chips.map((chip) => <button key={`${chip.key}-${chip.label}`} className="shrink-0" onClick={() => clearChip(chip)}><Badge variant="secondary">{chip.label} <X className="ml-1 inline h-3 w-3" /></Badge></button>)}</div>}
    </div>
    <Dialog open={open} onOpenChange={setOpen} title="Filters" description="Narrow expenses without crowding your phone screen." mobileBottomSheet>
      <div className="space-y-4"><FilterFields filters={filters} onChange={onChange} showSearch={false} /><div className="sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl md:-mx-7 md:-mb-8 md:pb-4"><Button className="w-full" onClick={() => setOpen(false)}>Show results</Button></div></div>
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

function ExpenseCard({ expense, onEdit, onRemove, onDuplicate, selected, selectionMode, onToggleSelected, onEnterSelectionMode }: { expense: Expense; onEdit: (expense: Expense) => void; onRemove: (expense: Expense) => void; onDuplicate: (expense: Expense) => void; selected: boolean; selectionMode: boolean; onToggleSelected: (expense: Expense) => void; onEnterSelectionMode: (expense: Expense) => void }) {
  const [open, setOpen] = React.useState(false)
  const color = categoryColor(expense.category)
  const Icon = categoryIcon(expense.category)
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onCardClick()
    }
  }

  return <div
    role="button"
    tabIndex={0}
    aria-label={`${expense.description || 'Expense'} ${currency.format(expense.amount)} on ${displayDate(expense.date)}`}
    aria-pressed={selectionMode ? selected : undefined}
    className={cn('relative min-w-0 cursor-pointer rounded-3xl border bg-card p-4 shadow-soft transition motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected && 'border-coral/40 bg-coral/10 ring-1 ring-coral/20')}
    onClick={onCardClick}
    onKeyDown={onKeyDown}
    onTouchStart={onTouchStart}
    onTouchMove={onTouchMove}
    onTouchEnd={clearLongPress}
    onTouchCancel={clearLongPress}
  >
    {selected && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-coral text-white shadow-soft"><Check className="h-4 w-4" /></span>}
    <div className="flex min-w-0 items-start justify-between gap-3 pr-7"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>{Icon ? <Icon className="h-5 w-5" strokeWidth={2.2} /> : (expense.category || '?').slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{expense.description || 'No description'}</p><p className="text-sm text-muted-foreground">{displayDate(expense.date)}</p></div></div><p className="shrink-0 whitespace-nowrap font-display text-lg font-extrabold text-coral">{currency.format(expense.amount)}</p></div>
    <div className="mt-3 flex min-w-0 flex-nowrap items-center gap-2"><div className="min-w-0 max-w-[38%] shrink"><ColorBadge value={categoryName(expense.category)} /></div><div className="min-w-0 flex-1 overflow-hidden"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></div>{expense.reimbursement && <div className="shrink-0"><ReimbursementChip value={expense.reimbursement} /></div>}{!selectionMode && <div className="shrink-0"><Button variant="ghost" size="icon" aria-label={open ? 'Close expense actions' : 'Open expense actions'} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}><MoreHorizontal className="h-5 w-5" /></Button></div>}</div>
    {open && <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3" onClick={(event) => event.stopPropagation()}>
      <Button variant="secondary" className="w-full" onClick={() => { setOpen(false); onEdit(expense) }}><Pencil className="h-4 w-4" />Edit</Button>
      <Button variant="outline" className="w-full" onClick={() => { setOpen(false); onDuplicate(expense) }}><Copy className="h-4 w-4" />Copy</Button>
      <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setOpen(false); onRemove(expense) }}><Trash2 className="h-4 w-4" />Delete</Button>
    </div>}
  </div>
}

export function ExpenseTable({ expenses, onEdit, onDuplicate, selectedIds, selectionMode, onToggleSelected, onSelectMany, onEnterSelectionMode }: { expenses: Expense[]; onEdit: (expense: Expense) => void; onDuplicate: (expense: Expense) => void; selectedIds: Set<number>; selectionMode: boolean; onToggleSelected: (expense: Expense) => void; onSelectMany: (expenses: Expense[], selected: boolean) => void; onEnterSelectionMode: (expense: Expense) => void }) {
  const [sortKey, setSortKey] = React.useState<SortKey>('date')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const [page, setPage] = React.useState(1)
  const deleteExpense = useDeleteExpense()
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  const { toast } = useToast()
  const pendingDeleteRef = React.useRef<{ timer: number; flush: () => Promise<void> } | null>(null)
  const sorted = React.useMemo(() => [...expenses].sort((a, b) => { const result = sortKey === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount; return sortDir === 'asc' ? result : -result }), [expenses, sortKey, sortDir])
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = sorted.slice((page - 1) * pageSize, page * pageSize)
  const selectedVisibleCount = sorted.filter((expense) => selectedIds.has(expense.rowIndex)).length
  const allVisibleSelected = sorted.length > 0 && selectedVisibleCount === sorted.length
  const partiallyVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < sorted.length
  React.useEffect(() => setPage(1), [expenses.length])
  React.useEffect(() => () => { void pendingDeleteRef.current?.flush() }, [])
  const toggleSort = (key: SortKey) => { setSortDir(sortKey === key && sortDir === 'desc' ? 'asc' : 'desc'); setSortKey(key) }
  const remove = async (expense: Expense) => {
    if (pendingDeleteRef.current) await pendingDeleteRef.current.flush()
    const queryKey = ['expenses', sheetId]
    const previous = queryClient.getQueryData<Expense[]>(queryKey)
    queryClient.setQueryData<Expense[]>(queryKey, (old) => (old || []).filter((item) => item.rowIndex !== expense.rowIndex))
    let committed = false
    const flush = async () => {
      if (committed) return
      committed = true
      window.clearTimeout(timer)
      if (pendingDeleteRef.current?.flush === flush) pendingDeleteRef.current = null
      try {
        await deleteExpense.mutateAsync(expense)
      } catch (error) {
        queryClient.setQueryData(queryKey, previous)
        toast({ title: 'Could not delete expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
      }
    }
    const undo = () => {
      if (committed) return
      committed = true
      window.clearTimeout(timer)
      if (pendingDeleteRef.current?.flush === flush) pendingDeleteRef.current = null
      queryClient.setQueryData(queryKey, previous)
    }
    const timer = window.setTimeout(() => { void flush() }, 5000)
    pendingDeleteRef.current = { timer, flush }
    toast({
      title: 'Expense deleted',
      description: expense.description || expense.category || 'Expense',
      action: { label: 'Undo', onClick: undo },
      duration: 5000,
    })
  }

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
            <td className="p-4"><ColorBadge value={categoryName(expense.category)} /></td>
            <td className="p-4"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></td>
            <td className="p-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(expense)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => onDuplicate(expense)} aria-label="Duplicate"><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(expense)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="grid gap-3 p-3 md:hidden">{(() => {
      let lastDate = ''
      const items: React.ReactNode[] = []
      const groupedByDate = sortKey === 'date'
      for (const expense of current) {
        if (groupedByDate && expense.date !== lastDate) {
          lastDate = expense.date
          items.push(<div key={`day-${expense.date}`} className="mt-2 px-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground first:mt-0">{dayLabel(expense.date)}</div>)
        }
        items.push(<ExpenseCard key={expense.rowIndex} expense={expense} onEdit={onEdit} onRemove={remove} onDuplicate={onDuplicate} selected={selectedIds.has(expense.rowIndex)} selectionMode={selectionMode} onToggleSelected={onToggleSelected} onEnterSelectionMode={onEnterSelectionMode} />)
      }
      return items
    })()}</div>
    {current.length === 0 && <div className="p-8 text-center md:p-12"><div className="mx-auto max-w-sm rounded-3xl border border-dashed bg-accent/40 p-6 text-muted-foreground">🌱 Nothing here yet — add your first expense!<br />尚無資料</div></div>}
    <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {sorted.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} · Total {currency.format(sumExpenses(sorted))}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>
  </Card>
}
