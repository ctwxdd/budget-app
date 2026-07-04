import * as React from 'react'
import { Button, Dialog, Input, Select, Textarea, useToast } from '../ui'
import { useAddCardBenefit, useUpdateCardBenefit } from '../../hooks/useCardBenefits'
import { useCategories } from '../../hooks/useExpenses'
import { useLanguage } from '../../hooks/useLanguage'
import { type CardBenefit, type CardBenefitPeriod } from '../../lib/cardBenefits'

const benefitPeriods: CardBenefitPeriod[] = ['monthly', 'quarterly', 'semiannual', 'annual']

type BenefitForm = {
  benefit: string
  amount: number
  period: CardBenefitPeriod
  category: string
  matcher: string
  startDate: string
  endDate: string
  active: boolean
}

function emptyBenefit(startDate?: string): BenefitForm {
  return { benefit: '', amount: 0, period: 'monthly', category: '', matcher: '', startDate: startDate || '', endDate: '', active: true }
}

function benefitFormFromRow(benefit: CardBenefit): BenefitForm {
  return { benefit: benefit.benefit, amount: benefit.amount, period: benefit.period, category: benefit.category, matcher: benefit.matcher, startDate: benefit.startDate, endDate: benefit.endDate, active: benefit.active }
}

export function BenefitDialog({ open, onOpenChange, benefit, productName, productOptions = [], startDate }: { open: boolean; onOpenChange: (open: boolean) => void; benefit: CardBenefit | null; productName: string; productOptions?: string[]; startDate?: string }) {
  const addBenefit = useAddCardBenefit()
  const updateBenefit = useUpdateCardBenefit()
  const categories = useCategories()
  const { t } = useLanguage()
  const { toast } = useToast()
  const [form, setForm] = React.useState<BenefitForm>(() => emptyBenefit())
  const [product, setProduct] = React.useState(productName)
  const isEditing = !!benefit

  React.useEffect(() => {
    if (!open) return
    setForm(benefit ? benefitFormFromRow(benefit) : emptyBenefit(startDate))
    setProduct(benefit?.card || productName)
  }, [open, benefit, productName, startDate])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload = {
      card: product.trim(),
      benefit: form.benefit.trim(),
      amount: Number(form.amount) || 0,
      period: form.period,
      category: form.category.trim(),
      matcher: form.matcher.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      active: form.active,
    }
    if (!payload.card) return toast({ title: t('benefits.productRequired', 'Product is required.'), variant: 'destructive' })
    if (!payload.benefit) return toast({ title: t('benefits.nameRequired', 'Benefit name is required.'), variant: 'destructive' })
    if (payload.amount <= 0) return toast({ title: t('benefits.amountRequired', 'Benefit amount must be greater than 0.'), variant: 'destructive' })
    try {
      if (benefit) await updateBenefit.mutateAsync({ rowIndex: benefit.rowIndex, benefit: payload })
      else await addBenefit.mutateAsync(payload)
      toast({ title: benefit ? t('benefits.updated', 'Benefit updated') : t('benefits.added', 'Benefit added') })
      onOpenChange(false)
    } catch (error) {
      toast({ title: benefit ? t('benefits.updateError', 'Could not update benefit') : t('benefits.addError', 'Could not add benefit'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const formId = 'benefit-form'
  const productChoices = React.useMemo(() => Array.from(new Set([product, ...productOptions].map((value) => value.trim()).filter(Boolean))), [product, productOptions])
  const saving = addBenefit.isPending || updateBenefit.isPending
  return <Dialog open={open} onOpenChange={onOpenChange} title={isEditing ? t('benefits.editTitle', 'Edit benefit') : t('benefits.addTitle', 'Add benefit')} description={t('benefits.dialogDescription', 'Save a card credit template to the CardBenefits tab in Google Sheets.')} mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('expense.cancel', 'Cancel')}</Button><Button type="submit" form={formId} disabled={saving}>{saving ? t('expense.saving', 'Saving...') : (isEditing ? t('expense.saveChanges', 'Save changes') : t('benefits.add', 'Add benefit'))}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('benefits.productTemplate', 'Product template')}
        <Select required value={product} onChange={(event) => setProduct(event.target.value)}>
          <option value="">{t('benefits.selectProduct', 'Select product')}</option>
          {productChoices.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">{t('benefits.name', 'Benefit name')}<Input required value={form.benefit} onChange={(event) => setForm({ ...form, benefit: event.target.value })} placeholder="Dining Credit" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('benefits.amount', 'Amount')}<Input required inputMode="decimal" type="number" min="0" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value === '' ? 0 : Number(event.target.value) })} placeholder="25" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('benefits.period', 'Period')}
        <Select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as CardBenefitPeriod })}>
          {benefitPeriods.map((period) => <option key={period} value={period}>{t(`benefits.period.${period}`, period)}</option>)}
        </Select>
      </label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('expense.category', 'Category')}
        <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
          <option value="">{t('benefits.anyCategory', 'Any category')}</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </Select>
      </label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('benefits.matcher', 'Merchant / tag')}<Input value={form.matcher} onChange={(event) => setForm({ ...form, matcher: event.target.value })} placeholder="Resy, hotel, wallet:Uber" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('benefits.startDate', 'Start date')}<Input className="min-w-0 max-w-full" inputMode="numeric" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} placeholder="YYYY-MM-DD or 12-01" /></label>
      <label className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">{t('benefits.endDate', 'End date')}<Input className="min-w-0 max-w-full" inputMode="numeric" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} placeholder="YYYY-MM-DD or 12-31" /></label>
      <label className="flex items-center gap-3 rounded-3xl border border-border/70 bg-white/70 p-3 text-sm font-semibold text-muted-foreground dark:bg-card/70 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-coral" />{t('card.active', 'Active')}</label>
    </form>
  </Dialog>
}
