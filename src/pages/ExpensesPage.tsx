import * as React from 'react'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { BatchEditDialog } from '../components/expenses/BatchEditDialog'
import { ExpenseDialog, ReturnDialog, type FormState } from '../components/expenses/ExpenseDialog'
import { ExpenseFilterBar, ExpenseTable, applyExpenseFilters, defaultFilters, type ExpenseFilters } from '../components/expenses/ExpenseTable'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { Button, ConfirmDialog } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useBatchDeleteExpenses, useExpenses } from '../hooks/useExpenses'
import type { Expense } from '../lib/types'

type AppOutletContext = {
  openExpenseDialog: (template?: FormState | null) => void
  setExpenseDialogTemplate?: (factory: (() => FormState | null) | null) => void
}

const todayIso = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export function ExpensesPage() {
  const navigate = useNavigate()
  const outlet = useOutletContext<AppOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const drilldownCategory = searchParams.get('category') || ''
  const drilldownPayment = searchParams.get('payment') || ''
  const fromAnalytics = searchParams.get('from') === 'analytics'
  const fromOverview = searchParams.get('from') === 'overview'
  const fromCards = searchParams.get('from') === 'cards'
  const initialFilters = React.useMemo<ExpenseFilters>(() => {
    const preset = searchParams.get('preset') as ExpenseFilters['preset'] | null
    const hasValidPreset = preset && ['thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'].includes(preset)
    if (!drilldownCategory && !drilldownPayment && !hasValidPreset) return defaultFilters
    return {
      ...defaultFilters,
      preset: hasValidPreset ? preset : 'all',
      start: searchParams.get('start') || '',
      end: searchParams.get('end') || '',
      categories: drilldownCategory ? [drilldownCategory] : [],
      payments: drilldownPayment ? [drilldownPayment] : [],
    }
  }, [drilldownCategory, drilldownPayment, searchParams])
  const { data = [], isLoading, error, refetch } = useExpenses()
  const [filters, setFilters] = React.useState(initialFilters)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [editingReturn, setEditingReturn] = React.useState<Expense | null>(null)
  const [returning, setReturning] = React.useState<Expense | null>(null)
  const [template, setTemplate] = React.useState<FormState | null>(null)
  const [templateOpen, setTemplateOpen] = React.useState(false)
  const [batchEditOpen, setBatchEditOpen] = React.useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = React.useState(false)
  const [selectionMode, setSelectionMode] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set())
  const batchDelete = useBatchDeleteExpenses()
  const { toast } = useToast()
  const filtered = React.useMemo(() => applyExpenseFilters(data, filters), [data, filters])
  const selectedExpenses = React.useMemo(() => data.filter((expense) => selectedIds.has(expense.rowIndex)), [data, selectedIds])
  const activePaymentFilter = filters.payments.length === 1 ? filters.payments[0].trim() : ''
  React.useEffect(() => {
    outlet.setExpenseDialogTemplate?.(activePaymentFilter
      ? () => ({ date: todayIso(), amount: 0, description: '', category: '', paymentMethod: activePaymentFilter, reimbursement: '' })
      : null)
    return () => outlet.setExpenseDialogTemplate?.(null)
  }, [activePaymentFilter, outlet])
  const clearDrilldown = () => {
    setFilters(defaultFilters)
    setSearchParams({}, { replace: true })
  }

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [])
  const toggleSelected = React.useCallback((expense: Expense) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(expense.rowIndex)) next.delete(expense.rowIndex)
      else next.add(expense.rowIndex)
      if (next.size === 0) setSelectionMode(false)
      return next
    })
  }, [])
  const selectMany = React.useCallback((expenses: Expense[], selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      expenses.forEach((expense) => selected ? next.add(expense.rowIndex) : next.delete(expense.rowIndex))
      return next
    })
  }, [])
  const enterSelectionMode = React.useCallback((expense?: Expense) => {
    setSelectionMode(true)
    if (expense) setSelectedIds((current) => new Set(current).add(expense.rowIndex))
  }, [])
  const deleteSelected = async () => {
    const count = selectedExpenses.length
    if (!count) { clearSelection(); return }
    try {
      await batchDelete.mutateAsync(selectedExpenses)
      toast({ title: `Deleted ${count} expense${count === 1 ? '' : 's'}` })
      clearSelection()
    } catch (error) {
      toast({ title: 'Could not delete expenses', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  if (isLoading) return <SkeletonCards />
  if (error) return <QueryError error={error} onRetry={() => { void refetch() }} />
  const duplicate = (expense: Expense) => {
    setTemplate({ date: todayIso(), amount: expense.amount, description: expense.description, category: expense.category, paymentMethod: expense.paymentMethod, reimbursement: expense.reimbursement })
    setTemplateOpen(true)
  }
  const editExpense = (expense: Expense) => expense.amount < 0 ? setEditingReturn(expense) : setEditing(expense)
  const createReturn = (expense: Expense) => setReturning(expense)
  return <div className="space-y-5">
    {fromOverview && <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-primary/20 bg-primary/[0.07] p-3 shadow-soft">
      <div className="mr-auto min-w-0 px-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview shortcut</p><p className="truncate text-sm font-bold">Transactions · this month</p></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/')}><ArrowLeft className="h-4 w-4" />Overview</Button>
      <Button type="button" variant="outline" size="sm" onClick={clearDrilldown}><X className="h-4 w-4" />Clear filter</Button>
    </div>}
    {fromAnalytics && drilldownCategory && <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-primary/20 bg-primary/[0.07] p-3 shadow-soft">
      <div className="mr-auto min-w-0 px-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics drill-down</p><p className="truncate text-sm font-bold">{drilldownCategory} · {filters.preset === 'custom' ? `${filters.start || 'Start'} – ${filters.end || 'End'}` : filters.preset.replace(/([A-Z])/g, ' $1').toLowerCase()}</p></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/analytics')}><ArrowLeft className="h-4 w-4" />Analytics</Button>
      <Button type="button" variant="outline" size="sm" onClick={clearDrilldown}><X className="h-4 w-4" />Clear filters</Button>
    </div>}
    {fromCards && drilldownPayment && <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-primary/20 bg-primary/[0.07] p-3 shadow-soft">
      <div className="mr-auto min-w-0 px-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cards drill-down</p><p className="truncate text-sm font-bold">{drilldownPayment} · {filters.preset === 'custom' ? `${filters.start || 'Start'} – ${filters.end || 'End'}` : filters.preset.replace(/([A-Z])/g, ' $1').toLowerCase()}</p></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/cards')}><ArrowLeft className="h-4 w-4" />Cards</Button>
      <Button type="button" variant="outline" size="sm" onClick={clearDrilldown}><X className="h-4 w-4" />Clear filters</Button>
    </div>}
    <ExpenseFilterBar filters={filters} onChange={setFilters} selectionMode={selectionMode} selectedCount={selectedIds.size} onEnterSelectionMode={() => enterSelectionMode()} onCancelSelection={clearSelection} />
    <ExpenseTable expenses={filtered} onEdit={editExpense} onDuplicate={duplicate} onReturn={createReturn} selectedIds={selectedIds} selectionMode={selectionMode} onToggleSelected={toggleSelected} onSelectMany={selectMany} onEnterSelectionMode={enterSelectionMode} />
    {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onClear={clearSelection} onEdit={() => setBatchEditOpen(true)} onDelete={() => setBatchDeleteOpen(true)} deleting={batchDelete.isPending} />}
    {editing && <ExpenseDialog open onOpenChange={(open) => !open && setEditing(null)} expense={editing} />}
    {templateOpen && <ExpenseDialog open onOpenChange={(open) => { if (!open) { setTemplateOpen(false); setTemplate(null) } }} template={template} />}
    {(returning || editingReturn) && <ReturnDialog open onOpenChange={(open) => { if (!open) { setReturning(null); setEditingReturn(null) } }} original={returning} returnExpense={editingReturn} />}
    <BatchEditDialog open={batchEditOpen} onOpenChange={setBatchEditOpen} expenses={selectedExpenses} onSaved={clearSelection} />
    <ConfirmDialog
      open={batchDeleteOpen}
      onOpenChange={setBatchDeleteOpen}
      title={`Delete ${selectedExpenses.length} expense${selectedExpenses.length === 1 ? '' : 's'}?`}
      description="This permanently removes the rows from your Google Sheet. There is no undo for batch delete."
      confirmLabel={batchDelete.isPending ? 'Deleting...' : 'Delete'}
      destructive
      onConfirm={deleteSelected}
    />
  </div>
}

function BulkActionBar({ count, onClear, onEdit, onDelete, deleting }: { count: number; onClear: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]">
    <div className="pointer-events-auto flex w-full max-w-[min(36rem,calc(100vw-1.5rem))] items-center gap-1.5 rounded-full border border-coral/20 bg-card/95 p-1.5 pl-4 shadow-[0_18px_40px_-20px_hsl(var(--foreground)/0.45)] backdrop-blur-xl animate-toast-pop">
      <button type="button" onClick={onClear} aria-label="Clear selection" className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      <span className="mr-auto text-sm font-extrabold text-foreground tabular-nums">{count} <span className="font-medium text-muted-foreground">selected</span></span>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} className="rounded-full"><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Edit</span></Button>
      <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting} className="rounded-full"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">{deleting ? 'Deleting…' : 'Delete'}</span><span className="sm:hidden">{deleting ? '…' : ''}</span></Button>
    </div>
  </div>
}
