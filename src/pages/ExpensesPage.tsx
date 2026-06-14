import * as React from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { BatchEditDialog } from '../components/expenses/BatchEditDialog'
import { ExpenseDialog } from '../components/expenses/ExpenseDialog'
import { ExpenseFilterBar, ExpenseTable, applyExpenseFilters, defaultFilters } from '../components/expenses/ExpenseTable'
import { SkeletonCards } from '../components/layout/Skeletons'
import { QueryError } from '../components/layout/QueryError'
import { Button } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useBatchDeleteExpenses, useExpenses } from '../hooks/useExpenses'
import type { Expense } from '../lib/types'

export function ExpensesPage() {
  const { data = [], isLoading, error, refetch } = useExpenses()
  const [filters, setFilters] = React.useState(defaultFilters)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [batchEditOpen, setBatchEditOpen] = React.useState(false)
  const [selectionMode, setSelectionMode] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set())
  const batchDelete = useBatchDeleteExpenses()
  const { toast } = useToast()
  const filtered = React.useMemo(() => applyExpenseFilters(data, filters), [data, filters])
  const selectedExpenses = React.useMemo(() => data.filter((expense) => selectedIds.has(expense.rowIndex)), [data, selectedIds])

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
    if (!count) return clearSelection()
    if (!window.confirm(`Delete ${count} selected expense${count === 1 ? '' : 's'}?`)) return
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
  return <div className="space-y-5">
    <ExpenseFilterBar filters={filters} onChange={setFilters} selectionMode={selectionMode} selectedCount={selectedIds.size} onEnterSelectionMode={() => enterSelectionMode()} onCancelSelection={clearSelection} />
    <ExpenseTable expenses={filtered} onEdit={setEditing} selectedIds={selectedIds} selectionMode={selectionMode} onToggleSelected={toggleSelected} onSelectMany={selectMany} onEnterSelectionMode={enterSelectionMode} />
    {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onClear={clearSelection} onEdit={() => setBatchEditOpen(true)} onDelete={deleteSelected} deleting={batchDelete.isPending} />}
    {editing && <ExpenseDialog open onOpenChange={(open) => !open && setEditing(null)} expense={editing} />}
    <BatchEditDialog open={batchEditOpen} onOpenChange={setBatchEditOpen} expenses={selectedExpenses} onSaved={clearSelection} />
  </div>
}

function BulkActionBar({ count, onClear, onEdit, onDelete, deleting }: { count: number; onClear: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <div className="fixed inset-x-3 bottom-20 z-40 md:bottom-6 md:left-1/2 md:right-auto md:w-[min(36rem,calc(100vw-2rem))] md:-translate-x-1/2">
    <div className="flex items-center gap-2 rounded-3xl border border-coral/20 bg-card/95 p-2 pl-4 shadow-2xl backdrop-blur-xl">
      <span className="mr-auto text-sm font-extrabold text-foreground">{count} selected</span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}><X className="h-4 w-4" />Clear</Button>
      <Button type="button" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" />Edit</Button>
      <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting}><Trash2 className="h-4 w-4" />{deleting ? 'Deleting...' : 'Delete'}</Button>
    </div>
  </div>
}
