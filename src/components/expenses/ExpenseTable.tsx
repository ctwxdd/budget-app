import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Filter, LayoutGrid, List, MoreHorizontal, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react'
import type { DatePreset, Expense } from '../../lib/types'
import { categoryColor, categoryIcon, categoryName, currency, displayDate, filterByDateRange, getPresetRange, sumExpenses } from '../../lib/format'
import { cn } from '../../lib/utils'
import { Badge, Button, Card, Dialog, Input, Select } from '../ui'
import { useAddExpense, useCategories, useDeleteExpense, usePaymentMethods, useSheetId, useSheetMeta } from '../../hooks/useExpenses'
import { useToast } from '../ui/Toast'

export type ExpenseFilters = { preset: DatePreset; start: string; end: string; categories: string[]; payments: string[]; reimbursement: string; search: string }
export const defaultFilters: ExpenseFilters = { preset: 'all', start: '', end: '', categories: [], payments: [], reimbursement: 'All', search: '' }

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
  return <div className="min-w-0 space-y-2"><div className="flex min-w-0 gap-2"><Select className="min-w-0 flex-1" aria-label={label} value={choice} onChange={(event) => { const value = event.target.value; setChoice(''); if (value && !values.includes(value)) onChange([...values, value]) }}><option value="">{label}</option>{options.map((option) => <option key={option}>{option}</option>)}</Select>{values.length > 0 && <Button type="button" variant="ghost" className="shrink-0 px-3" onClick={() => onChange([])}>Clear</Button>}</div>{values.length > 0 && <div className="flex gap-1.5 overflow-x-auto pb-1">{values.map((value) => <button key={value} className="shrink-0" onClick={() => onChange(values.filter((item) => item !== value))}><Badge variant="secondary">{value} ×</Badge></button>)}</div>}</div>
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

  return <div className="relative min-w-0">
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
  const customWithSearch = filters.preset === 'custom' && showSearch
  return <div className={cn('grid min-w-0 gap-3', customWithSearch ? 'lg:grid-cols-[minmax(8rem,0.75fr)_minmax(12rem,1.2fr)_minmax(12rem,1.1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]' : 'lg:grid-cols-[minmax(8rem,0.75fr)_minmax(14rem,1.35fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]')}>
    <Select value={filters.preset} onChange={(event) => onChange({ ...filters, preset: event.target.value as DatePreset })}><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="all">All</option><option value="custom">Custom</option></Select>
    {filters.preset === 'custom' ? <DateRangePicker start={filters.start} end={filters.end} onChange={(start, end) => onChange({ ...filters, start, end })} /> : showSearch ? <Input className="min-w-0" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} /> : <div className="hidden lg:block" />}
    {filters.preset === 'custom' && showSearch && <Input className="min-w-0" placeholder="Search description..." value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} />}
    <MultiSelect label="Categories" values={filters.categories} options={categories} onChange={(categories) => onChange({ ...filters, categories })} />
    <MultiSelect label="Payment methods" values={filters.payments} options={payments} onChange={(payments) => onChange({ ...filters, payments })} />
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
    else if (chip.key === 'preset') onChange({ ...filters, preset: 'all', start: '', end: '' })
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

function ExpenseActionPanel({ expense, onEdit, onRemove, onDuplicate, onReturn, onClose }: { expense: Expense; onEdit: (expense: Expense) => void; onRemove: (expense: Expense) => void; onDuplicate: (expense: Expense) => void; onReturn: (expense: Expense) => void; onClose: () => void }) {
  return <div className={cn('grid gap-2', expense.amount > 0 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3')}>
    <Button variant="secondary" size="sm" className="w-full px-2 text-xs" onClick={() => { onClose(); onEdit(expense) }}><Pencil className="h-4 w-4" />Edit</Button>
    {expense.amount > 0 && <Button variant="outline" size="sm" className="w-full px-2 text-xs" onClick={() => { onClose(); onReturn(expense) }}><RotateCcw className="h-4 w-4" />Return</Button>}
    <Button variant="outline" size="sm" className="w-full px-2 text-xs" onClick={() => { onClose(); onDuplicate(expense) }}><Copy className="h-4 w-4" />Copy</Button>
    <Button variant="outline" size="sm" className="w-full px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { onClose(); onRemove(expense) }}><Trash2 className="h-4 w-4" />Delete</Button>
  </div>
}

function ExpenseMoreMenu({ expense, onOpenSheet, canOpenSheet }: { expense: Expense; onOpenSheet: (expense: Expense) => void; canOpenSheet: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  const sheetDisabled = !canOpenSheet || expense.rowIndex < 2
  const stop = (event: React.SyntheticEvent) => event.stopPropagation()
  return <div className="relative -m-1.5 p-1.5" onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop}>
    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Open expense menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal className="h-5 w-5" /></Button>
    {open && <div className="absolute right-0 z-30 mt-1.5 min-w-56 rounded-2xl border border-border bg-card p-1.5 shadow-lift">
      <button
        type="button"
        disabled={sheetDisabled}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
        onClick={() => { setOpen(false); onOpenSheet(expense) }}
      >
        <ExternalLink className="h-4 w-4" />Open in Google Sheets
      </button>
    </div>}
  </div>
}

type ExpenseItemProps = {
  expense: Expense
  onEdit: (expense: Expense) => void
  onRemove: (expense: Expense) => void
  onDuplicate: (expense: Expense) => void
  onReturn: (expense: Expense) => void
  onOpenSheet: (expense: Expense) => void
  canOpenSheet: boolean
  selected: boolean
  selectionMode: boolean
  onToggleSelected: (expense: Expense) => void
  onEnterSelectionMode: (expense: Expense) => void
}

function ExpenseCard({ expense, onEdit, onRemove, onDuplicate, onReturn, onOpenSheet, canOpenSheet, selected, selectionMode, onToggleSelected, onEnterSelectionMode }: ExpenseItemProps) {
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
    else setOpen((value) => !value)
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
    <div className="mt-3 flex min-w-0 flex-nowrap items-center gap-2"><div className="min-w-0 max-w-[38%] shrink"><ColorBadge value={categoryName(expense.category)} /></div><div className="min-w-0 flex-1 overflow-hidden"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></div>{expense.reimbursement && <div className="shrink-0"><ReimbursementChip value={expense.reimbursement} /></div>}{!selectionMode && <div className="shrink-0"><ExpenseMoreMenu expense={expense} canOpenSheet={canOpenSheet} onOpenSheet={onOpenSheet} /></div>}</div>
    {open && <div className="mt-3 border-t border-border/70 pt-3" onClick={(event) => event.stopPropagation()}><ExpenseActionPanel expense={expense} onEdit={onEdit} onReturn={onReturn} onDuplicate={onDuplicate} onRemove={onRemove} onClose={() => setOpen(false)} /></div>}
  </div>
}

function ExpenseListItem({ expense, onEdit, onRemove, onDuplicate, onReturn, onOpenSheet, canOpenSheet, selected, selectionMode, onToggleSelected, onEnterSelectionMode }: ExpenseItemProps) {
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
  const activate = () => {
    if (longPressFiredRef.current) { longPressFiredRef.current = false; return }
    if (selectionMode) onToggleSelected(expense)
    else setOpen((value) => !value)
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

  return <div className={cn('relative border-b border-border/60 bg-card transition last:border-b-0', selected && 'bg-coral/10')}>
    <div
      role="button"
      tabIndex={0}
      aria-label={`${expense.description || 'Expense'} ${currency.format(expense.amount)} on ${displayDate(expense.date)}`}
      aria-pressed={selectionMode ? selected : undefined}
      className="flex min-h-[72px] min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:active:bg-accent/60"
      onClick={activate}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate() } }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>
        {Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} /> : (expense.category || '?').slice(0, 1).toUpperCase()}
        {selected && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-coral text-white"><Check className="h-3 w-3" /></span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{expense.description || 'No description'}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{categoryName(expense.category)} · {expense.paymentMethod || 'Unknown'}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-sm font-extrabold tabular-nums text-coral">{currency.format(expense.amount)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{displayDate(expense.date)}</p>
      </div>
      {!selectionMode && <div className="shrink-0"><ExpenseMoreMenu expense={expense} canOpenSheet={canOpenSheet} onOpenSheet={onOpenSheet} /></div>}
    </div>
    {open && <div className="border-t border-border/60 px-3 py-2.5" onClick={(event) => event.stopPropagation()}><ExpenseActionPanel expense={expense} onEdit={onEdit} onReturn={onReturn} onDuplicate={onDuplicate} onRemove={onRemove} onClose={() => setOpen(false)} /></div>}
  </div>
}

export function ExpenseTable({ expenses, onEdit, onDuplicate, onReturn, selectedIds, selectionMode, onToggleSelected, onSelectMany, onEnterSelectionMode }: { expenses: Expense[]; onEdit: (expense: Expense) => void; onDuplicate: (expense: Expense) => void; onReturn: (expense: Expense) => void; selectedIds: Set<number>; selectionMode: boolean; onToggleSelected: (expense: Expense) => void; onSelectMany: (expenses: Expense[], selected: boolean) => void; onEnterSelectionMode: (expense: Expense) => void }) {
  const [sortKey, setSortKey] = React.useState<SortKey>('date')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const [page, setPage] = React.useState(1)
  const [openRowIndex, setOpenRowIndex] = React.useState<number | null>(null)
  const [mobileView, setMobileView] = React.useState<'cards' | 'list'>(() => localStorage.getItem('budget.expenseMobileView') === 'cards' ? 'cards' : 'list')
  const deleteExpense = useDeleteExpense()
  const addExpense = useAddExpense()
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  const sheetMeta = useSheetMeta()
  const expenseSheetGid = sheetMeta.data?.sheets.find((sheet) => sheet.title === 'Expense')?.sheetId
  const { toast } = useToast()
  const sorted = React.useMemo(() => [...expenses].sort((a, b) => {
    const primary = sortKey === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount
    const tieBreaker = a.rowIndex - b.rowIndex
    const result = primary || tieBreaker
    return sortDir === 'asc' ? result : -result
  }), [expenses, sortKey, sortDir])
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = sorted.slice((page - 1) * pageSize, page * pageSize)
  const selectedVisibleCount = sorted.filter((expense) => selectedIds.has(expense.rowIndex)).length
  const allVisibleSelected = sorted.length > 0 && selectedVisibleCount === sorted.length
  const partiallyVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < sorted.length
  React.useEffect(() => setPage(1), [expenses.length])
  React.useEffect(() => { localStorage.setItem('budget.expenseMobileView', mobileView) }, [mobileView])
  const toggleSort = (key: SortKey) => { setSortDir(sortKey === key && sortDir === 'desc' ? 'asc' : 'desc'); setSortKey(key) }
  const canOpenSheet = Boolean(sheetId && expenseSheetGid !== undefined)
  const openInSheet = (expense: Expense) => {
    if (!sheetId || expenseSheetGid === undefined || expense.rowIndex < 2) return
    const rowRange = `A${expense.rowIndex}:F${expense.rowIndex}`
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${expenseSheetGid}&range=${rowRange}&rangeid=${rowRange}`, '_blank', 'noopener,noreferrer')
  }
  const remove = async (expense: Expense) => {
    const queryKey = ['expenses', sheetId]
    const previous = queryClient.getQueryData<Expense[]>(queryKey)
    queryClient.setQueryData<Expense[]>(queryKey, (old) => (old || []).filter((item) => item.rowIndex !== expense.rowIndex))
    try {
      await deleteExpense.mutateAsync(expense)
      toast({
        title: 'Expense deleted',
        description: expense.description || expense.category || 'Expense',
        action: {
          label: 'Undo',
          onClick: () => {
            void addExpense.mutateAsync({
              date: expense.date,
              amount: expense.amount,
              description: expense.description,
              category: expense.category,
              paymentMethod: expense.paymentMethod,
              reimbursement: expense.reimbursement,
            }).catch((error) => {
              toast({ title: 'Could not restore expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
            })
          },
        },
        duration: 5000,
      })
    } catch (error) {
      queryClient.setQueryData(queryKey, previous)
      toast({ title: 'Could not delete expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
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
          const open = openRowIndex === expense.rowIndex
          return <React.Fragment key={expense.rowIndex}>
            <tr className={cn('cursor-pointer border-t transition hover:bg-coral/5', selected && 'bg-coral/10', open && 'bg-accent/35')} onClick={() => selectionMode ? onToggleSelected(expense) : setOpenRowIndex((currentRow) => currentRow === expense.rowIndex ? null : expense.rowIndex)}>
              <td className="p-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${expense.description || 'expense'}`} className="h-4 w-4 rounded border-input accent-coral" checked={selected} onChange={() => onToggleSelected(expense)} /></td>
              <td className="whitespace-nowrap p-4">{displayDate(expense.date)}</td>
              <td className="p-4 text-right font-display font-bold text-coral">{currency.format(expense.amount)}</td>
              <td className="p-4">{expense.description || <span className="text-muted-foreground">No description</span>}</td>
              <td className="p-4"><ColorBadge value={categoryName(expense.category)} /></td>
              <td className="p-4"><ColorBadge value={expense.paymentMethod || 'Unknown'} variant="payment" /></td>
              <td className="p-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end"><ExpenseMoreMenu expense={expense} canOpenSheet={canOpenSheet} onOpenSheet={openInSheet} /></div></td>
            </tr>
            {open && !selectionMode && <tr className="border-t bg-accent/20"><td colSpan={7} className="p-3"><ExpenseActionPanel expense={expense} onEdit={onEdit} onReturn={onReturn} onDuplicate={onDuplicate} onRemove={remove} onClose={() => setOpenRowIndex(null)} /></td></tr>}
          </React.Fragment>
        })}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between border-b border-border/70 bg-card px-3 py-2 md:hidden">
      <p className="text-xs font-semibold text-muted-foreground">{mobileView === 'cards' ? 'Card view' : 'Compact list'}</p>
      <div className="flex rounded-2xl bg-muted/60 p-1" role="group" aria-label="Expense view">
        <button type="button" aria-label="Card view" aria-pressed={mobileView === 'cards'} onClick={() => setMobileView('cards')} className={cn('grid h-8 w-9 place-items-center rounded-xl transition', mobileView === 'cards' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}><LayoutGrid className="h-4 w-4" /></button>
        <button type="button" aria-label="List view" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')} className={cn('grid h-8 w-9 place-items-center rounded-xl transition', mobileView === 'list' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}><List className="h-4 w-4" /></button>
      </div>
    </div>
    <div className={cn('md:hidden', mobileView === 'cards' ? 'grid gap-3 p-3' : 'divide-y-0')}>{(() => {
      let lastDate = ''
      const items: React.ReactNode[] = []
      const groupedByDate = sortKey === 'date'
      for (const expense of current) {
        if (groupedByDate && expense.date !== lastDate) {
          lastDate = expense.date
          items.push(<div key={`day-${expense.date}`} className={cn('text-[11px] font-bold uppercase tracking-wider text-muted-foreground', mobileView === 'cards' ? 'mt-2 px-1 pt-1 first:mt-0' : 'border-y border-border/60 bg-muted/30 px-3 py-1.5 first:border-t-0')}>{dayLabel(expense.date)}</div>)
        }
        const sharedProps = { expense, onEdit, onRemove: remove, onDuplicate, onReturn, onOpenSheet: openInSheet, canOpenSheet, selected: selectedIds.has(expense.rowIndex), selectionMode, onToggleSelected, onEnterSelectionMode }
        items.push(mobileView === 'cards' ? <ExpenseCard key={expense.rowIndex} {...sharedProps} /> : <ExpenseListItem key={expense.rowIndex} {...sharedProps} />)
      }
      return items
    })()}</div>
    {current.length === 0 && <div className="p-8 text-center md:p-12"><div className="mx-auto max-w-sm rounded-3xl border border-dashed bg-accent/40 p-6 text-muted-foreground">🌱 Nothing here yet — add your first expense!<br />尚無資料</div></div>}
    <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {sorted.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} · Total {currency.format(sumExpenses(sorted))}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>
  </Card>
}
