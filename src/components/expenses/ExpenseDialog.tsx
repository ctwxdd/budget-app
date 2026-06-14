import * as React from 'react'
import { format } from 'date-fns'
import type { Expense } from '../../lib/types'
import { Button, Dialog, Input, Select } from '../ui'
import { useAddExpense, useCategories, usePaymentMethods, useUpdateExpense } from '../../hooks/useExpenses'
import { useGiftcards, type GiftcardRow, type MerchantRow } from '../../hooks/useGiftcards'
import { useCards } from '../../hooks/useCards'
import { appendNoteToDescription, classifyPaymentMethod, composeGiftcardDescription, parseGiftcardDescription, splitDescriptionNote, type GiftcardDescriptionParts, type PaymentMethodType } from '../../lib/giftcards'
import { currency } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useToast } from '../ui/Toast'

type FormState = Omit<Expense, 'rowIndex'>
const emptyForm = (): FormState => ({ date: format(new Date(), 'yyyy-MM-dd'), amount: 0, description: '', category: '', paymentMethod: 'Credit Card', reimbursement: '' })
const emptyGiftcardParts = (): GiftcardDescriptionParts => ({ vendor: '', face: '', source: '' })
const paymentTypes: { type: PaymentMethodType; label: string; emoji: string }[] = [
  { type: 'card', label: 'Card', emoji: '💳' },
  { type: 'giftcard', label: 'Giftcard', emoji: '🎁' },
  { type: 'cash', label: 'Cash', emoji: '💵' },
]

function DatalistInput({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  return <><Input list={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><datalist id={id}>{options.map((option) => <option key={option} value={option} />)}</datalist></>
}

export function ExpenseDialog({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (open: boolean) => void; expense?: Expense | null }) {
  const categories = useCategories()
  const paymentMethods = usePaymentMethods()
  const giftcards = useGiftcards()
  const managedCards = useCards()
  const addExpense = useAddExpense()
  const updateExpense = useUpdateExpense()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [note, setNote] = React.useState('')
  const [noteOpen, setNoteOpen] = React.useState(false)
  const [giftcardParts, setGiftcardParts] = React.useState<GiftcardDescriptionParts>(emptyGiftcardParts)
  const [giftcardStructured, setGiftcardStructured] = React.useState(true)
  const [paymentType, setPaymentType] = React.useState<PaymentMethodType>('card')
  const [selectedMerchant, setSelectedMerchant] = React.useState('')
  const [selectedGiftcardCard, setSelectedGiftcardCard] = React.useState<'auto' | string>('auto')

  React.useEffect(() => {
    if (!open) return
    const next = expense ? { date: expense.date, amount: expense.amount, description: expense.description, category: expense.category, paymentMethod: expense.paymentMethod, reimbursement: expense.reimbursement } : emptyForm()
    const description = splitDescriptionNote(next.description)
    next.description = description.base
    setForm(next)
    setNote(description.note)
    setNoteOpen(Boolean(description.note))
    const parsedGiftcard = next.category === 'Giftcard' ? parseGiftcardDescription(next.description) : null
    setGiftcardParts(parsedGiftcard || emptyGiftcardParts())
    setGiftcardStructured(next.category !== 'Giftcard' || Boolean(parsedGiftcard) || !next.description)
    if (expense) {
      const inferredPaymentType = classifyPaymentMethod(next.paymentMethod)
      const merchant = findMerchantForMethod(next.paymentMethod, giftcards.merchants) || ''
      const specificCard = merchant && next.paymentMethod !== merchant ? next.paymentMethod : ''
      setPaymentType(inferredPaymentType)
      setSelectedMerchant(merchant)
      setSelectedGiftcardCard(specificCard || 'auto')
    } else {
      setPaymentType('card')
      setSelectedMerchant('')
      setSelectedGiftcardCard('auto')
    }
  }, [open, expense, giftcards.merchants])

  const vendors = React.useMemo(() => Array.from(new Set(giftcards.cards.map((card) => card.vendor).filter(Boolean))).sort(), [giftcards.cards])
  const activeMerchants = React.useMemo(() => [...giftcards.merchants].filter((merchant) => merchant.active && merchant.balance > 0.005).sort((a, b) => b.balance - a.balance || a.merchant.localeCompare(b.merchant)), [giftcards.merchants])
  const merchantOptions = React.useMemo(() => {
    const selected = giftcards.merchants.find((merchant) => merchant.merchant === selectedMerchant)
    return selected && !activeMerchants.some((merchant) => merchant.merchant === selected.merchant) ? [selected, ...activeMerchants] : activeMerchants
  }, [activeMerchants, giftcards.merchants, selectedMerchant])
  const filteredPaymentMethods = React.useMemo(() => paymentMethods.filter((method) => classifyPaymentMethod(method) === paymentType), [paymentMethods, paymentType])
  const cardPaymentMethods = React.useMemo(() => mergePrioritized(managedCards.cards.filter((card) => card.active && card.name).map((card) => card.name), filteredPaymentMethods), [managedCards.cards, filteredPaymentMethods])
  const selectedCards = React.useMemo(() => giftcards.cards.filter((card) => card.vendor === selectedMerchant).sort((a, b) => a.date.localeCompare(b.date)), [giftcards.cards, selectedMerchant])

  const setCategory = (category: string) => {
    setForm((current) => ({ ...current, category }))
    if (category === 'Giftcard') {
      const parsed = parseGiftcardDescription(form.description)
      setGiftcardParts(parsed || emptyGiftcardParts())
      setGiftcardStructured(Boolean(parsed) || !form.description)
    }
  }

  const selectGiftcardMerchant = (merchant: string) => {
    setSelectedMerchant(merchant)
    setSelectedGiftcardCard('auto')
    setForm((current) => ({ ...current, paymentMethod: merchant }))
  }

  const selectGiftcardCard = (card: 'auto' | string) => {
    setSelectedGiftcardCard(card)
    setForm((current) => ({ ...current, paymentMethod: card === 'auto' ? selectedMerchant : card }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.amount || form.amount <= 0) return toast({ title: 'Amount must be greater than zero.', variant: 'destructive' })
    if (form.category === 'Giftcard' && giftcardStructured && !giftcardParts.vendor.trim()) return toast({ title: 'Vendor is required for giftcard purchases.', variant: 'destructive' })
    const description = form.category === 'Giftcard' && giftcardStructured
      ? composeGiftcardDescription(giftcardParts, note)
      : appendNoteToDescription(form.description, note)
    const payload = { date: form.date, amount: Number(form.amount), description, category: form.category, paymentMethod: form.paymentMethod, reimbursement: form.reimbursement }
    try {
      if (expense) await updateExpense.mutateAsync({ ...payload, rowIndex: expense.rowIndex })
      else await addExpense.mutateAsync(payload)
      toast({ title: expense ? 'Expense updated' : 'Expense added' })
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Could not save expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const giftcardPurchase = form.category === 'Giftcard'
  return <Dialog open={open} onOpenChange={onOpenChange} title={expense ? 'Edit expense' : 'Add expense'} description="Saved directly to your Google Sheet" mobileBottomSheet>
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2 pb-2">
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Date<Input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Amount<Input type="number" min="0.01" step="0.01" required value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
      <div className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span>Description</span>
        {giftcardPurchase
          ? <GiftcardComposer parts={giftcardParts} structured={giftcardStructured} vendors={vendors} rawDescription={form.description} onRawChange={(description) => setForm({ ...form, description })} onStructuredChange={setGiftcardStructured} onChange={setGiftcardParts} />
          : <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Groceries, rent, coffee..." />}
      </div>
      <div className="space-y-2 sm:col-span-2">
        {noteOpen ? <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Note<Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="chase 10%, shared dinner..." /></label> : <Button type="button" variant="ghost" size="sm" className="px-0 text-coral hover:bg-transparent" onClick={() => setNoteOpen(true)}>+ Add note</Button>}
      </div>
      <label className="space-y-1.5 text-sm font-semibold text-muted-foreground">Category<CategoryCombobox value={form.category} onChange={setCategory} options={categories} /></label>
      <div className="space-y-3 text-sm font-semibold text-muted-foreground">
        <span>Payment method</span>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-accent/50 p-0.5">
          {paymentTypes.map((item) => <button key={item.type} type="button" aria-label={item.label} className={cn('flex h-9 items-center justify-center gap-1 rounded-full px-2 text-[11px] leading-none transition md:h-8 md:px-3 md:text-xs', paymentType === item.type ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')} onClick={() => {
            const previousType = paymentType
            setPaymentType(item.type)
            if (item.type === 'giftcard') {
              const merchant = findMerchantForMethod(form.paymentMethod, giftcards.merchants) || selectedMerchant
              const specificCard = merchant && form.paymentMethod !== merchant ? form.paymentMethod : ''
              setSelectedMerchant(merchant)
              setSelectedGiftcardCard(specificCard || 'auto')
            } else if (previousType !== item.type && classifyPaymentMethod(form.paymentMethod) !== item.type) {
              setForm({ ...form, paymentMethod: '' })
            }
          }} title={item.label}><span>{item.emoji}</span><span className="hidden min-[420px]:inline">{item.label}</span></button>)}
        </div>
        <div className="pt-1">
          {paymentType === 'giftcard'
            ? <GiftcardPaymentPicker merchants={merchantOptions} cards={selectedCards} selectedMerchant={selectedMerchant} selectedCard={selectedGiftcardCard} onMerchantSelect={selectGiftcardMerchant} onCardSelect={selectGiftcardCard} />
            : <DatalistInput id={`payment-options-${paymentType}`} value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} options={paymentType === 'card' ? (cardPaymentMethods.length ? cardPaymentMethods : filteredPaymentMethods) : filteredPaymentMethods} placeholder={paymentType === 'card' ? 'Choose or type a card' : 'Cash, Venmo, Zelle…'} />}
        </div>
      </div>
      <div className="sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] mt-4 flex flex-col-reverse gap-2 border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-14px_28px_-24px_rgba(31,41,55,0.45)] backdrop-blur-xl sm:col-span-2 sm:-mx-7 sm:-mb-8 sm:flex-row sm:justify-end sm:pb-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="gradient" disabled={addExpense.isPending || updateExpense.isPending}>{(addExpense.isPending || updateExpense.isPending) ? 'Saving...' : (expense ? 'Save changes' : 'Add expense')}</Button></div>
    </form>
  </Dialog>
}

function CategoryCombobox({ value, onChange, options, placeholder = 'Choose or type a category' }: { value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  const [open, setOpen] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)
  const id = React.useId()
  const normalizedOptions = React.useMemo(() => Array.from(new Set(options.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [options])
  const query = value.trim().toLocaleLowerCase()
  const exactMatch = normalizedOptions.some((option) => option.toLocaleLowerCase() === query)
  const visibleOptions = showAll || !query ? normalizedOptions : normalizedOptions.filter((option) => {
    const normalizedOption = option.toLocaleLowerCase()
    return normalizedOption.includes(query) && normalizedOption !== query
  })

  const choose = (option: string) => {
    onChange(option)
    setOpen(false)
    setShowAll(false)
  }

  return <div className="relative">
    <Input role="combobox" aria-expanded={open} aria-controls={id} value={value} placeholder={placeholder} className="pr-12" onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); setShowAll(false) }} />
    <button type="button" aria-label="Show category options" className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen((current) => !current); setShowAll(true) }}>▾</button>
    {open && (visibleOptions.length > 0 || !exactMatch) && <div id={id} role="listbox" className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-3xl border border-border/70 bg-card p-1.5 shadow-lift">
      {visibleOptions.map((option) => <button key={option} type="button" role="option" aria-selected={option === value} className={cn('w-full rounded-2xl px-3 py-2 text-left text-sm font-medium transition hover:bg-coral/5', option === value ? 'bg-coral/10 text-coral' : 'text-foreground')} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}
      {!visibleOptions.length && <p className="px-3 py-2 text-xs font-medium text-muted-foreground">No matches. Keep typing to add a new category.</p>}
    </div>}
  </div>
}

function GiftcardComposer({ parts, structured, vendors, rawDescription, onChange, onRawChange, onStructuredChange }: { parts: GiftcardDescriptionParts; structured: boolean; vendors: string[]; rawDescription: string; onChange: (parts: GiftcardDescriptionParts) => void; onRawChange: (description: string) => void; onStructuredChange: (structured: boolean) => void }) {
  if (!structured) return <div className="space-y-2"><Input value={rawDescription} onChange={(event) => onRawChange(event.target.value)} placeholder="Giftcard description" /><Button type="button" variant="outline" size="sm" onClick={() => { onChange(parseGiftcardDescription(rawDescription) || emptyGiftcardParts()); onStructuredChange(true) }}>Switch to structured</Button></div>
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="sm:col-span-3"><DatalistInput id="giftcard-vendors" value={parts.vendor} onChange={(vendor) => onChange({ ...parts, vendor })} options={vendors} placeholder="Vendor, e.g. H&M GC" /></div>
    <Input type="number" min="0" step="0.01" value={parts.face} onChange={(event) => onChange({ ...parts, face: event.target.value })} placeholder="Face amount (same as paid)" />
    <Input className="sm:col-span-2" value={parts.source} onChange={(event) => onChange({ ...parts, source: event.target.value })} placeholder="Source, e.g. Office Depot" />
  </div>
}

function GiftcardPaymentPicker({ merchants, cards, selectedMerchant, selectedCard, onMerchantSelect, onCardSelect }: { merchants: MerchantRow[]; cards: GiftcardRow[]; selectedMerchant: string; selectedCard: 'auto' | string; onMerchantSelect: (merchant: string) => void; onCardSelect: (card: 'auto' | string) => void }) {
  const orderedCards = React.useMemo(() => [...cards].sort((a, b) => Number(a.balance <= 0.005) - Number(b.balance <= 0.005) || a.date.localeCompare(b.date)), [cards])
  return <div className="space-y-3 rounded-3xl border border-border/70 bg-white/70 p-3 dark:bg-card/70">
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Merchant</span>
      <Select value={selectedMerchant} onChange={(event) => onMerchantSelect(event.target.value)}>
        <option value="">Select merchant…</option>
        {merchants.map((merchant) => <option key={merchant.merchant} value={merchant.merchant}>{merchant.merchant} — {currency.format(merchant.balance)} left · {merchant.cardCount} card{merchant.cardCount === 1 ? '' : 's'}</option>)}
      </Select>
    </label>
    {!merchants.length && <p className="rounded-2xl bg-accent/50 p-3 text-xs font-medium">No active giftcards found.</p>}
    {selectedMerchant && <label className="block space-y-1.5 transition-all duration-200 ease-out">
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Card</span>
      <Select value={selectedCard} onChange={(event) => onCardSelect(event.target.value as 'auto' | string)}>
        <option value="auto">✨ Auto (FIFO from oldest)</option>
        {orderedCards.map((card) => {
          const depleted = card.balance <= 0.005
          const method = methodForCard(card)
          return <option key={`${card.card}-${card.date}`} value={method} disabled={depleted}>{card.date} — Paid {currency.format(card.paid)} / Face {currency.format(card.face)} — {currency.format(card.balance)} left</option>
        })}
      </Select>
    </label>}
  </div>
}

function methodForCard(card: GiftcardRow) {
  return `${card.vendor} (${card.date})`
}

function findMerchantForMethod(paymentMethod: string, merchants: MerchantRow[]) {
  return [...merchants].sort((a, b) => b.merchant.length - a.merchant.length).find((merchant) => paymentMethod === merchant.merchant || paymentMethod.startsWith(`${merchant.merchant} (`) || paymentMethod.startsWith(`${merchant.merchant} #`))?.merchant
}

function mergePrioritized(primary: string[], secondary: string[]) {
  const seen = new Set<string>()
  return [...primary, ...secondary].filter((value) => {
    const key = value.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
