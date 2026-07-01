import * as React from 'react'
import { Button, Dialog, FadeScroll, Input } from '../ui'
import { useBatchUpdateExpenses, useCategories, usePaymentMethods, useTags } from '../../hooks/useExpenses'
import type { Expense } from '../../lib/types'
import { useToast } from '../ui/Toast'
import { formatTags } from '../../lib/tags'
import { useLanguage } from '../../hooks/useLanguage'
import { todayIso } from '../../lib/dates'

type BatchEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenses: Expense[]
  onSaved?: () => void
}

function DatalistInput({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  return <><Input list={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><datalist id={id}>{options.map((option) => <option key={option} value={option} />)}</datalist></>
}

export function BatchEditDialog({ open, onOpenChange, expenses, onSaved }: BatchEditDialogProps) {
  const categories = useCategories()
  const paymentMethods = usePaymentMethods()
  const tags = useTags()
  const batchUpdate = useBatchUpdateExpenses()
  const { toast } = useToast()
  const { t, language } = useLanguage()
  const [category, setCategory] = React.useState('')
  const [applyPaymentMethod, setApplyPaymentMethod] = React.useState(false)
  const [paymentMethod, setPaymentMethod] = React.useState('')
  const [applyDate, setApplyDate] = React.useState(false)
  const [date, setDate] = React.useState(todayIso)
  const [applyTags, setApplyTags] = React.useState(false)
  const [tagText, setTagText] = React.useState('')
  const formId = React.useId()

  React.useEffect(() => {
    if (!open) return
    setCategory('')
    setApplyPaymentMethod(false)
    setPaymentMethod('')
    setApplyDate(false)
    setDate(todayIso())
    setApplyTags(false)
    setTagText('')
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const fieldUpdates: Partial<Pick<Expense, 'date' | 'category' | 'paymentMethod' | 'tags'>> = {}
    if (category) fieldUpdates.category = category
    if (applyPaymentMethod) fieldUpdates.paymentMethod = paymentMethod
    if (applyDate) fieldUpdates.date = date
    if (applyTags) fieldUpdates.tags = formatTags(tagText)
    if (!Object.keys(fieldUpdates).length) return toast({ title: t('batch.chooseField', 'Choose at least one field to update.'), variant: 'destructive' })
    if (!expenses.length) {
      toast({ title: t('batch.updatedZero', 'Updated 0 expenses') })
      onSaved?.()
      onOpenChange(false)
      return
    }

    try {
      await batchUpdate.mutateAsync(expenses.map((expense) => ({ rowIndex: expense.rowIndex, updates: fieldUpdates })))
      toast({ title: language === 'zh' ? `已更新 ${expenses.length} 筆支出` : `Updated ${expenses.length} expense${expenses.length === 1 ? '' : 's'}` })
      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({ title: t('batch.updateError', 'Could not update expenses'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={t('batch.title', 'Batch edit expenses')}
    description={language === 'zh' ? `套用變更到 ${expenses.length} 筆選取的支出。` : `Apply changes to ${expenses.length} selected expense${expenses.length === 1 ? '' : 's'}.`}
    mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('expense.cancel', 'Cancel')}</Button><Button type="submit" form={formId} disabled={batchUpdate.isPending}>{batchUpdate.isPending ? t('expense.saving', 'Saving...') : t('expense.saveChanges', 'Save changes')}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-4 pb-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">
        {t('expense.category', 'Category')}
        <CategoryCombobox value={category} onChange={setCategory} options={categories} emptyLabel={t('batch.keepCurrent', '— Keep current —')} />
      </label>

      <div className="space-y-2 text-sm font-semibold text-muted-foreground">
        <label className="flex items-center gap-2 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-input accent-coral" checked={applyPaymentMethod} onChange={(event) => setApplyPaymentMethod(event.target.checked)} />
          {t('batch.applyPayment', 'Apply payment method')}
        </label>
        <DatalistInput id="batch-payment-method-options" value={paymentMethod} onChange={setPaymentMethod} options={paymentMethods} placeholder={t('batch.keepCurrent', '— Keep current —')} />
      </div>

      <div className="space-y-2 text-sm font-semibold text-muted-foreground">
        <label className="flex items-center gap-2 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-input accent-coral" checked={applyDate} onChange={(event) => setApplyDate(event.target.checked)} />
          {t('batch.applyDate', 'Apply date')}
        </label>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={!applyDate} />
      </div>

      <div className="space-y-2 text-sm font-semibold text-muted-foreground">
        <label className="flex items-center gap-2 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-input accent-coral" checked={applyTags} onChange={(event) => setApplyTags(event.target.checked)} />
          {t('batch.applyTags', 'Apply tags')}
        </label>
        <DatalistInput id="batch-tag-options" value={tagText} onChange={setTagText} options={tags} placeholder={t('batch.tagPlaceholder', 'Trip, Project, Family...')} />
        <p className="px-1 text-[11px] font-medium text-muted-foreground/80">{t('batch.tagHelp', "This replaces the selected expenses' tags. Separate multiple tags with commas.")}</p>
      </div>

    </form>
  </Dialog>
}

function CategoryCombobox({ value, onChange, options, emptyLabel }: { value: string; onChange: (value: string) => void; options: string[]; emptyLabel: string }) {
  const [open, setOpen] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)
  const { t } = useLanguage()
  const id = React.useId()
  const normalizedOptions = React.useMemo(() => Array.from(new Set(options.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [options])
  const query = value.trim().toLocaleLowerCase()
  const categoryOptions = showAll || !query ? normalizedOptions : normalizedOptions.filter((option) => option.toLocaleLowerCase().includes(query))
  const visibleOptions = [{ value: '', label: emptyLabel }, ...categoryOptions.map((option) => ({ value: option, label: option }))]

  const choose = (option: string) => {
    onChange(option)
    setOpen(false)
    setShowAll(false)
  }

  return <div className="relative">
    <Input role="combobox" aria-expanded={open} aria-controls={id} value={value} placeholder={emptyLabel} className="pr-12" onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); setShowAll(false) }} />
    <button type="button" aria-label={t('expense.categoryPlaceholder', 'Show category options')} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen((current) => !current); setShowAll(true) }}>▾</button>
    {open && <FadeScroll
      id={id}
      role="listbox"
      outerClassName="absolute z-30 mt-1 w-full rounded-3xl border border-border/70 bg-card shadow-lift"
      className="max-h-56 overflow-y-auto p-1.5"
    >
      {visibleOptions.map((option) => <button key={option.value || '__empty'} type="button" role="option" aria-selected={option.value === value} className={`w-full rounded-2xl px-3 py-2 text-left text-sm font-medium transition hover:bg-coral/5 ${option.value === value ? 'bg-coral/10 text-coral' : 'text-foreground'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}>{option.label}</button>)}
      {categoryOptions.length === 0 && value && <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{t('batch.noCategoryMatches', 'No matches. Keep typing to add a new category.')}</p>}
    </FadeScroll>}
  </div>
}
