import * as React from 'react'
import { format } from 'date-fns'
import type { Expense } from '../../lib/types'
import { Button, Dialog, Input, Select } from '../ui'
import { useAddExpense, useCategories, useExpenses, usePaymentMethods, useUpdateExpense } from '../../hooks/useExpenses'
import { useGiftcards, type GiftcardRow, type MerchantRow } from '../../hooks/useGiftcards'
import { useCards } from '../../hooks/useCards'
import type { CardRow } from '../../hooks/useCards'
import { appendNoteToDescription, classifyPaymentMethod, composeGiftcardDescription, parseGiftcardDescription, splitDescriptionNote, type GiftcardDescriptionParts, type PaymentMethodType } from '../../lib/giftcards'
import { currency } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useToast } from '../ui/Toast'

export type FormState = Omit<Expense, 'rowIndex'>
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

function isoDaysAgo(days: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function DateQuickChips({ selected, onPick }: { selected: string; onPick: (value: string) => void }) {
  const chips = React.useMemo(() => [
    { label: 'Today', value: isoDaysAgo(0) },
    { label: 'Yesterday', value: isoDaysAgo(1) },
    { label: '2d ago', value: isoDaysAgo(2) },
  ], [])
  return <div className="flex flex-wrap gap-1.5 pt-1">{chips.map((chip) => {
    const active = selected === chip.value
    return <button
      key={chip.label}
      type="button"
      onClick={() => onPick(chip.value)}
      className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition motion-safe:active:scale-[0.96]', active ? 'border-coral/40 bg-coral/15 text-coral' : 'border-border bg-accent/40 text-muted-foreground hover:bg-accent/70')}
    >{chip.label}</button>
  })}</div>
}

type DescriptionSuggestion = { display: string; count: number; sameCategory: number; lastDate: string }

function buildDescriptionSuggestions(expenses: Expense[], category: string): DescriptionSuggestion[] {
  const counts = new Map<string, DescriptionSuggestion>()
  for (const expense of expenses) {
    const base = splitDescriptionNote(expense.description).base.trim()
    if (!base) continue
    const key = base.toLocaleLowerCase()
    const entry = counts.get(key) || { display: base, count: 0, sameCategory: 0, lastDate: '' }
    entry.count += 1
    if (category && expense.category === category) entry.sameCategory += 1
    if (expense.date > entry.lastDate) { entry.lastDate = expense.date; entry.display = base }
    counts.set(key, entry)
  }
  return Array.from(counts.values()).sort((a, b) => {
    if (b.sameCategory !== a.sameCategory) return b.sameCategory - a.sameCategory
    if (b.count !== a.count) return b.count - a.count
    return b.lastDate.localeCompare(a.lastDate)
  })
}

function DescriptionAutosuggest({ value, onChange, suggestions, placeholder, currentCategory }: { value: string; onChange: (value: string) => void; suggestions: DescriptionSuggestion[]; placeholder?: string; currentCategory: string }) {
  const [focused, setFocused] = React.useState(false)
  const [highlight, setHighlight] = React.useState(-1)
  const blurTimerRef = React.useRef<number | null>(null)
  const query = value.trim().toLocaleLowerCase()
  const filtered = React.useMemo(() => {
    if (!suggestions.length) return [] as DescriptionSuggestion[]
    if (!query) return suggestions.slice(0, 6)
    const matches = suggestions.filter((s) => {
      const display = s.display.toLocaleLowerCase()
      return display.includes(query) && display !== query
    })
    return matches.slice(0, 6)
  }, [suggestions, query])

  React.useEffect(() => { setHighlight(-1) }, [value, focused])
  React.useEffect(() => () => { if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current) }, [])

  const pick = (suggestion: DescriptionSuggestion) => {
    onChange(suggestion.display)
    setFocused(false)
  }
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!filtered.length || !focused) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((h) => (h + 1) % filtered.length) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1)) }
    else if (event.key === 'Enter' && highlight >= 0) { event.preventDefault(); pick(filtered[highlight]) }
    else if (event.key === 'Escape') { setFocused(false) }
  }
  const open = focused && filtered.length > 0
  return <div className="relative">
    <Input
      value={value}
      onChange={(event) => { onChange(event.target.value); setFocused(true) }}
      onFocus={() => { if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current); setFocused(true) }}
      onBlur={() => { blurTimerRef.current = window.setTimeout(() => setFocused(false), 150) }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoComplete="off"
      enterKeyHint="done"
    />
    {open && <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-60 overflow-auto rounded-2xl border border-border bg-card p-1 shadow-lift">
      {filtered.map((suggestion, index) => <button
        key={suggestion.display}
        type="button"
        className={cn('flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition', index === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(suggestion)}
      >
        <span className="truncate font-medium text-foreground">{suggestion.display}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {suggestion.sameCategory > 0 && currentCategory && <span className="rounded-full bg-coral/15 px-1.5 py-0.5 text-coral">{currentCategory}</span>}
          <span>×{suggestion.count}</span>
        </span>
      </button>)}
    </div>}
  </div>
}

export function ExpenseDialog({ open, onOpenChange, expense, template }: { open: boolean; onOpenChange: (open: boolean) => void; expense?: Expense | null; template?: FormState | null }) {
  const categories = useCategories()
  const paymentMethods = usePaymentMethods()
  const expensesQuery = useExpenses()
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
    const next = expense
      ? { date: expense.date, amount: expense.amount, description: expense.description, category: expense.category, paymentMethod: expense.paymentMethod, reimbursement: expense.reimbursement }
      : template
        ? { ...template }
        : emptyForm()
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
  const formId = React.useId()
  const descriptionSuggestions = React.useMemo(() => buildDescriptionSuggestions(expensesQuery.data || [], form.category), [expensesQuery.data, form.category])
  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={expense ? 'Edit expense' : 'Add expense'}
    description="Saved directly to your Google Sheet"
    mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form={formId} variant="gradient" disabled={addExpense.isPending || updateExpense.isPending}>{(addExpense.isPending || updateExpense.isPending) ? 'Saving...' : (expense ? 'Save changes' : 'Add expense')}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid min-w-0 gap-x-5 gap-y-4 pb-2 sm:grid-cols-2 sm:gap-y-5">
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Date</span><Input className="min-w-0 max-w-full appearance-none" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><DateQuickChips selected={form.date} onPick={(date) => setForm({ ...form, date })} /></label>
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Amount</span><Input className="min-w-0 max-w-full" inputMode="decimal" type="number" min="0.01" step="0.01" required value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
      <div className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span className="block">Description</span>
        {giftcardPurchase
          ? <GiftcardComposer parts={giftcardParts} structured={giftcardStructured} vendors={vendors} rawDescription={form.description} onRawChange={(description) => setForm({ ...form, description })} onStructuredChange={setGiftcardStructured} onChange={setGiftcardParts} />
          : <DescriptionAutosuggest value={form.description} onChange={(description) => setForm({ ...form, description })} suggestions={descriptionSuggestions} currentCategory={form.category} placeholder="Groceries, rent, coffee..." />}
      </div>
      <div className="min-h-6 sm:col-span-2">
        {noteOpen ? <label className="block space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Note</span><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="chase 10%, shared dinner..." /></label> : <Button type="button" variant="ghost" size="sm" className="h-6 px-0 py-0 text-coral hover:bg-transparent" onClick={() => setNoteOpen(true)}>+ Add note</Button>}
      </div>
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Category</span><CategoryCombobox value={form.category} onChange={setCategory} options={categories} /></label>
      <div className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">
        <span className="block">Payment method</span>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-accent/50 p-0.5">
          {paymentTypes.map((item) => <button key={item.type} type="button" aria-label={item.label} className={cn('flex h-9 items-center justify-center gap-1 rounded-full px-2 text-[11px] leading-none transition md:h-8 md:px-3 md:text-xs', paymentType === item.type ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')} onClick={() => {
            const previousType = paymentType
            setPaymentType(item.type)
            if (item.type === 'giftcard') {
              const merchant = findMerchantForMethod(form.paymentMethod, giftcards.merchants) || selectedMerchant
              const specificCard = merchant && form.paymentMethod !== merchant ? form.paymentMethod : ''
              setSelectedMerchant(merchant)
              setSelectedGiftcardCard(specificCard || 'auto')
            } else if (item.type === 'cash') {
              setForm({ ...form, paymentMethod: 'Cash' })
            } else if (previousType !== item.type && classifyPaymentMethod(form.paymentMethod) !== item.type) {
              setForm({ ...form, paymentMethod: '' })
            }
          }} title={item.label}><span>{item.emoji}</span><span>{item.label}</span></button>)}
        </div>
        {paymentType !== 'cash' && <div className="pt-2">
          {paymentType === 'giftcard'
            ? <GiftcardPaymentPicker merchants={merchantOptions} cards={selectedCards} selectedMerchant={selectedMerchant} selectedCard={selectedGiftcardCard} onMerchantSelect={selectGiftcardMerchant} onCardSelect={selectGiftcardCard} />
            : <CardPaymentPicker value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} cards={managedCards.cards.filter((card) => card.active && card.name)} fallback={filteredPaymentMethods} />}
        </div>}
      </div>
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

function describeCard(card: CardRow) {
  const tail = card.last4 ? ` ••${card.last4}` : ''
  const issuer = card.issuer ? ` — ${card.issuer}` : ''
  return `${card.name}${tail}${issuer}`
}

const CUSTOM_CARD_VALUE = '__custom__'

function CardPaymentPicker({ value, onChange, cards, fallback }: { value: string; onChange: (value: string) => void; cards: CardRow[]; fallback: string[] }) {
  const fallbackOptions = React.useMemo(() => {
    const seen = new Set(cards.map((card) => card.name.trim().toLocaleLowerCase()))
    return fallback.filter((option) => {
      const key = option.trim().toLocaleLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [cards, fallback])
  const matchesOption = React.useMemo(() => {
    if (!value) return true
    return cards.some((card) => card.name === value) || fallbackOptions.includes(value)
  }, [cards, fallbackOptions, value])
  const [customMode, setCustomMode] = React.useState(() => Boolean(value) && !matchesOption)

  React.useEffect(() => {
    if (value && !matchesOption) setCustomMode(true)
  }, [value, matchesOption])

  if (customMode) {
    return <div className="space-y-2 rounded-3xl border border-border/70 bg-white/70 p-3 dark:bg-card/70">
      <Input value={value} placeholder="Card name…" onChange={(event) => onChange(event.target.value)} autoFocus={!value} />
      <button type="button" className="text-xs font-semibold text-coral hover:underline" onClick={() => { onChange(''); setCustomMode(false) }}>← Pick from list</button>
    </div>
  }

  return <div className="space-y-3 rounded-3xl border border-border/70 bg-white/70 p-3 dark:bg-card/70">
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Card</span>
      <Select value={matchesOption ? value : ''} onChange={(event) => {
        if (event.target.value === CUSTOM_CARD_VALUE) { onChange(''); setCustomMode(true); return }
        onChange(event.target.value)
      }}>
        <option value="">Select card…</option>
        {cards.length > 0 && <optgroup label="Your cards">
          {cards.map((card) => <option key={`mc-${card.rowIndex}`} value={card.name}>{describeCard(card)}</option>)}
        </optgroup>}
        {fallbackOptions.length > 0 && <optgroup label="Other">
          {fallbackOptions.map((option) => <option key={`fb-${option}`} value={option}>{option}</option>)}
        </optgroup>}
        <option value={CUSTOM_CARD_VALUE}>✏️ Custom…</option>
      </Select>
    </label>
    {!cards.length && <p className="rounded-2xl bg-accent/50 p-3 text-xs font-medium">Add cards in the Cards tab for faster picking.</p>}
  </div>
}
