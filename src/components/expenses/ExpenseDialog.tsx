import * as React from 'react'
import { format } from 'date-fns'
import { Calculator } from 'lucide-react'
import type { Expense } from '../../lib/types'
import { Button, Dialog, FadeScroll, Input, Select } from '../ui'
import { useAddExpense, useCategories, useExpenses, useTags, useUpdateExpense } from '../../hooks/useExpenses'
import { useGiftcards, type GiftcardRow, type MerchantRow } from '../../hooks/useGiftcards'
import { useCards } from '../../hooks/useCards'
import type { CardRow } from '../../hooks/useCards'
import { appendNoteToDescription, classifyPaymentMethod, composeGiftcardDescription, parseGiftcardDescription, splitDescriptionNote, type GiftcardDescriptionParts, type PaymentMethodType } from '../../lib/giftcards'
import { currency } from '../../lib/format'
import { findOriginalExpenseForReturn, getReturnSummary } from '../../lib/returns'
import { cn } from '../../lib/utils'
import { useToast } from '../ui/Toast'
import { formatTags, parseTags } from '../../lib/tags'
import { useLanguage } from '../../hooks/useLanguage'
import { todayIso } from '../../lib/dates'

export type FormState = Omit<Expense, 'rowIndex'>
const emptyForm = (): FormState => ({ date: todayIso(), amount: 0, description: '', category: '', paymentMethod: '', reimbursement: '', tags: '' })
const emptyGiftcardParts = (): GiftcardDescriptionParts => ({ vendor: '', face: '', source: '' })
const returnDescription = (expense: Expense) => `Return: ${splitDescriptionNote(expense.description).base || expense.category || 'Purchase'} (${expense.date})`
type GiftcardReturnMode = 'original' | 'new'
type SplitPayment = {
  id: string
  amount: number
  paymentType: PaymentMethodType
  paymentMethod: string
  selectedMerchant: string
  selectedGiftcardCard: 'auto' | string
}
const paymentTypes: { type: PaymentMethodType; label: string; emoji: string }[] = [
  { type: 'card', label: 'Card', emoji: '💳' },
  { type: 'giftcard', label: 'Giftcard', emoji: '🎁' },
  { type: 'cash', label: 'Cash', emoji: '💵' },
]
const paymentTypeKey: Record<PaymentMethodType, string> = {
  card: 'expense.card',
  giftcard: 'expense.giftcard',
  cash: 'expense.cash',
}

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100)
}

function fromCents(value: number) {
  return Number((value / 100).toFixed(2))
}

function newSplitPayment(amount = 0, seed?: Partial<SplitPayment>): SplitPayment {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return {
    id: randomId,
    amount,
    paymentType: seed?.paymentType || 'card',
    paymentMethod: seed?.paymentMethod || '',
    selectedMerchant: seed?.selectedMerchant || '',
    selectedGiftcardCard: seed?.selectedGiftcardCard || 'auto',
  }
}

function StringAutosuggest({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  const [focused, setFocused] = React.useState(false)
  const [highlight, setHighlight] = React.useState(-1)
  const blurTimerRef = React.useRef<number | null>(null)
  const query = value.trim().toLocaleLowerCase()
  const filtered = React.useMemo(() => {
    if (!options.length) return [] as string[]
    if (!query) return options.slice(0, 6)
    const matches = options.filter((option) => {
      const display = option.toLocaleLowerCase()
      return display.includes(query) && display !== query
    })
    return matches.slice(0, 6)
  }, [options, query])

  React.useEffect(() => { setHighlight(-1) }, [value, focused])
  React.useEffect(() => () => { if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current) }, [])

  const pick = (option: string) => { onChange(option); setFocused(false) }
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
    />
    {open && <FadeScroll
      outerClassName="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-2xl border border-border bg-card shadow-lift"
      className="max-h-60 overflow-auto p-1"
    >
      {filtered.map((option, index) => <button
        key={option}
        type="button"
        className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition', index === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(option)}
      >
        <span className="truncate font-medium text-foreground">{option}</span>
      </button>)}
    </FadeScroll>}
  </div>
}

function TagsInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = useTags()
  const { t } = useLanguage()
  const [draft, setDraft] = React.useState('')
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const tagPointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const selected = React.useMemo(() => parseTags(value), [value])
  const selectedKeys = React.useMemo(() => new Set(selected.map((tag) => tag.toLocaleLowerCase())), [selected])
  const query = draft.trim().toLocaleLowerCase()
  const suggestions = React.useMemo(() => options
    .filter((tag) => !selectedKeys.has(tag.toLocaleLowerCase()))
    .filter((tag) => !query || tag.toLocaleLowerCase().includes(query)), [options, query, selectedKeys])
  const exactDraft = Boolean(draft.trim() && selectedKeys.has(draft.trim().toLocaleLowerCase()))
  const canAddDraft = Boolean(draft.trim() && !exactDraft)
  const open = dropdownOpen && (suggestions.length > 0 || canAddDraft || !options.length)

  React.useEffect(() => { setHighlight(0) }, [draft, dropdownOpen])

  const setSelected = (tags: string[]) => onChange(formatTags(tags.join(', ')))
  const addTags = (raw: string) => {
    const next = parseTags(raw).filter((tag) => !selectedKeys.has(tag.toLocaleLowerCase()))
    if (!next.length) return
    setSelected([...selected, ...next])
    setDraft('')
    setDropdownOpen(false)
  }
  const removeTag = (tag: string) => setSelected(selected.filter((item) => item !== tag))
  const onDraftChange = (next: string) => {
    if (!next.includes(',')) {
      setDraft(next)
      return
    }
    const parts = next.split(',')
    addTags(parts.slice(0, -1).join(','))
    setDraft(parts.at(-1) || '')
  }
  const pick = (tag: string) => addTags(tag)
  const rememberTagPointer: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    tagPointerRef.current = { x: event.clientX, y: event.clientY }
  }
  const isTagTap = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = tagPointerRef.current
    tagPointerRef.current = null
    return !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
  }
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const suggestion = suggestions[highlight]
      if (open && suggestion) pick(suggestion)
      else addTags(draft)
    } else if (event.key === 'ArrowDown' && open) {
      event.preventDefault()
      setHighlight((current) => (current + 1) % Math.max(1, suggestions.length + (canAddDraft ? 1 : 0)))
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault()
      const count = Math.max(1, suggestions.length + (canAddDraft ? 1 : 0))
      setHighlight((current) => (current <= 0 ? count - 1 : current - 1))
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open) {
      setDropdownOpen(true)
    } else if (event.key === 'Backspace' && !draft && selected.length) {
      removeTag(selected[selected.length - 1])
    } else if (event.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  return <div className="space-y-2">
    {selected.length > 0 && <div className="flex flex-wrap gap-1.5">
      {selected.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.08] py-1 pl-2.5 pr-1 text-xs font-bold text-primary">
        #{tag}
        <button type="button" aria-label={`Remove ${tag} tag`} className="grid h-6 w-6 place-items-center rounded-full text-primary/65 transition hover:bg-primary/15 hover:text-primary" onClick={() => removeTag(tag)}>×</button>
      </span>)}
    </div>}
    <div className="flex gap-2">
      <Input
        value={draft}
        onChange={(event) => { onDraftChange(event.target.value); setDropdownOpen(true) }}
        onFocus={() => setDropdownOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={selected.length ? t('expense.tagAnotherPlaceholder', 'Add another tag...') : t('expense.tagPlaceholder', 'Travel, House, Project...')}
        autoComplete="off"
      />
      <Button type="button" variant="outline" className="h-12 shrink-0 rounded-full px-4 text-xs" onClick={() => setDropdownOpen((current) => !current)}>
        {t('expense.allTags', 'All tags')}
      </Button>
    </div>
    {open && <div className="rounded-2xl border border-border/70 bg-card/95 p-2 shadow-sm">
      <FadeScroll className="grid max-h-44 gap-1 overflow-auto pr-1 sm:grid-cols-2">
        {suggestions.map((tag, index) => <button
          key={tag}
          type="button"
          className={cn('flex min-h-10 w-full items-center gap-1.5 rounded-xl border px-3 py-2 text-left text-sm font-bold transition', index === highlight ? 'border-primary/30 bg-primary/[0.12] text-primary' : 'border-border bg-background/80 text-foreground hover:bg-accent/70')}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={rememberTagPointer}
          onPointerUp={(event) => { if (isTagTap(event)) pick(tag) }}
        >
          <span className="text-primary">#</span><span className="min-w-0 truncate">{tag}</span>
        </button>)}
        {canAddDraft && <button
          type="button"
          className={cn('flex min-h-10 w-full items-center gap-1.5 rounded-xl border px-3 py-2 text-left text-sm font-bold transition sm:col-span-2', highlight === suggestions.length ? 'border-primary/30 bg-primary/[0.12] text-primary' : 'border-dashed border-primary/35 bg-primary/[0.06] text-primary hover:bg-primary/10')}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={rememberTagPointer}
          onPointerUp={(event) => { if (isTagTap(event)) addTags(draft) }}
        >
          <span>+</span><span className="min-w-0 truncate">{t('expense.addTag', 'Add')} “{draft.trim()}”</span>
        </button>}
        {!suggestions.length && !canAddDraft && <div className="px-3 py-2 text-sm font-semibold text-muted-foreground">{t('expense.noTags', 'No tags yet')}</div>}
      </FadeScroll>
    </div>}
    <p className="px-1 text-[11px] font-medium text-muted-foreground/80">{t('expense.tagHelp', 'Pick an existing tag or type a new one. Commas add multiple tags.')}</p>
  </div>
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

function DateQuickChips({ selected, onPick, className }: { selected: string; onPick: (value: string) => void; className?: string }) {
  const { t } = useLanguage()
  const chips = React.useMemo(() => [
    { label: t('expense.today', 'Today'), value: isoDaysAgo(0) },
    { label: t('expense.yesterday', 'Yesterday'), value: isoDaysAgo(1) },
    { label: t('expense.twoDaysAgo', '2d ago'), value: isoDaysAgo(2) },
  ], [t])
  return <div className={cn('flex flex-wrap gap-1', className)}>{chips.map((chip) => {
    const active = selected === chip.value
    return <button
      key={chip.label}
      type="button"
      onClick={() => onPick(chip.value)}
      className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 transition motion-safe:active:scale-[0.96]', active ? 'border-coral/40 bg-coral/15 text-coral' : 'border-border bg-accent/40 text-muted-foreground hover:bg-accent/70')}
    >{chip.label}</button>
  })}</div>
}

type DescriptionSuggestion = { display: string; count: number; sameCategory: number; lastDate: string }

function normalizeDescription(value: string) {
  return splitDescriptionNote(value).base.trim().toLocaleLowerCase()
}

function findLatestMatchingDescription(expenses: Expense[], description: string) {
  const key = normalizeDescription(description)
  if (!key) return null
  return expenses.findLast((expense) => normalizeDescription(expense.description) === key) || null
}

function sameExpense(a: FormState, b: Expense) {
  return a.date === b.date &&
    Math.abs(Number(a.amount) - Number(b.amount)) < 0.005 &&
    a.description.trim() === splitDescriptionNote(b.description).base.trim() &&
    a.category.trim() === b.category.trim() &&
    a.paymentMethod.trim() === b.paymentMethod.trim() &&
    a.reimbursement.trim() === b.reimbursement.trim() &&
    formatTags(a.tags) === formatTags(b.tags)
}

function sumAmountExpression(input: string): number | null {
  const value = input.trim()
  if (!value || /[+-]$/.test(value)) return null
  const parts = value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)
  if (!parts?.length || parts.join('') !== value) return null
  let total = 0
  for (const part of parts) {
    total += Number(part)
  }
  return Number.isFinite(total) ? total : null
}

function formatAmountInput(value: number, allowZero = false) {
  return value || allowZero ? String(value) : ''
}

type DecimalInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: number
  onChange: (value: string) => void
  allowZero?: boolean
}

function DecimalInput({ value, onChange, allowZero = false, onFocus, onBlur, ...props }: DecimalInputProps) {
  const [focused, setFocused] = React.useState(false)
  const amountValue = formatAmountInput(value, allowZero)
  const [inputValue, setInputValue] = React.useState(amountValue)

  React.useEffect(() => {
    if (!focused) setInputValue(amountValue)
  }, [amountValue, focused])

  return <Input
    {...props}
    inputMode="decimal"
    pattern="[0-9]*[.]?[0-9]*"
    value={focused ? inputValue : amountValue}
    onFocus={(event) => {
      setFocused(true)
      onFocus?.(event)
    }}
    onBlur={(event) => {
      setFocused(false)
      setInputValue(amountValue)
      onBlur?.(event)
    }}
    onChange={(event) => {
      setInputValue(event.target.value)
      onChange(event.target.value)
    }}
  />
}

function AmountInputWithCalculator({ label, value, onChange, allowZero = false }: { label: string; value: number; onChange: (value: string) => void; allowZero?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [expression, setExpression] = React.useState('')
  const result = React.useMemo(() => sumAmountExpression(expression), [expression])
  const amountValue = formatAmountInput(value, allowZero)
  const addToken = (token: string) => {
    setExpression((current) => {
      if (/^\d+$/.test(token)) return current === '0' ? token : current + token
      if (token === '.') {
        const segment = current.split(/[+-]/).pop() || ''
        if (segment.includes('.')) return current
        return current && !/[+-]$/.test(current) ? `${current}.` : `${current}0.`
      }
      if (token === '-' && !current) return '-'
      if (!current || /[+-]$/.test(current)) return current
      return `${current}${token}`
    })
  }
  const backspace = () => setExpression((current) => current.slice(0, -1))
  const apply = () => {
    if (result === null) return
    const next = result.toFixed(2)
    onChange(next)
    setOpen(false)
  }

  return <div className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground">
    <span className="block">{label}</span>
    <div>
      <div className="flex min-w-0 gap-2">
        <DecimalInput
          className="min-w-0 flex-1"
          required
          value={value}
          allowZero={allowZero}
          onChange={onChange}
        />
        <button
          type="button"
          aria-label="Open amount calculator"
          className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full border border-input bg-white/80 text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card', open && 'bg-accent text-coral')}
          onClick={() => {
            setExpression((current) => current || amountValue)
            setOpen((current) => !current)
          }}
        >
          <Calculator className="h-4 w-4" />
        </button>
      </div>
      {open && <div className="mt-2 space-y-3 rounded-2xl border border-border bg-card p-3 text-sm shadow-lift">
        <div className="min-h-11 rounded-2xl border border-border bg-background/70 px-3 py-2 text-right">
          <div className="truncate font-mono text-lg font-bold text-foreground">{expression || '0'}</div>
          <div className="mt-0.5 h-4 text-xs font-semibold text-muted-foreground">{result === null ? 'Tap numbers, +, and - to calculate' : currency.format(result)}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {['7', '8', '9', 'Del', '4', '5', '6', '+', '1', '2', '3', '-', '00', '0', '.'].map((key) => {
            const operator = key === '+' || key === '-'
            return <button
              key={key}
              type="button"
              className={cn('h-11 rounded-2xl border border-border bg-white/80 text-base font-extrabold text-foreground shadow-sm transition motion-safe:active:scale-[0.97] hover:bg-accent dark:bg-card', operator && 'bg-coral/10 text-coral hover:bg-coral/15', key === 'Del' && 'text-muted-foreground')}
              onClick={() => key === 'Del' ? backspace() : addToken(key)}
            >{key}</button>
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('min-w-0 truncate text-xs font-semibold', result === null ? 'text-muted-foreground' : 'text-foreground')}>
            {result === null ? 'No valid total yet' : `Result ${currency.format(result)}`}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setExpression('')}>Clear</Button>
            <Button type="button" size="sm" onClick={apply} disabled={result === null}>Use</Button>
          </div>
        </div>
      </div>}
    </div>
  </div>
}

function buildDescriptionSuggestions(expenses: Expense[], category: string): DescriptionSuggestion[] {
  const counts = new Map<string, DescriptionSuggestion>()
  for (const expense of expenses) {
    let base = splitDescriptionNote(expense.description).base.trim()
    if (!base) continue
    if (expense.category === 'Giftcard') {
      const parsed = parseGiftcardDescription(expense.description)
      if (parsed?.vendor) base = parsed.vendor
    }
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

function DescriptionAutosuggest({ value, onChange, suggestions, placeholder, currentCategory, isOpen, onOpenChange }: { value: string; onChange: (value: string) => void; suggestions: DescriptionSuggestion[]; placeholder?: string; currentCategory: string; isOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalFocused, setInternalFocused] = React.useState(false)
  const focused = isOpen !== undefined ? isOpen : internalFocused
  const setFocused = (next: boolean) => { if (isOpen === undefined) setInternalFocused(next); onOpenChange?.(next) }
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
    {open && <FadeScroll
      outerClassName="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-2xl border border-border bg-card shadow-lift"
      className="max-h-60 overflow-auto p-1"
    >
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
    </FadeScroll>}
  </div>
}

export function ExpenseDialog({ open, onOpenChange, expense, template }: { open: boolean; onOpenChange: (open: boolean) => void; expense?: Expense | null; template?: FormState | null }) {
  const { t } = useLanguage()
  const categories = useCategories()
  const expensesQuery = useExpenses()
  const giftcards = useGiftcards()
  const managedCards = useCards()
  // The Cards tab is the single source of truth for the picker. Active
  // cards only, reverse sheet order so the newest additions surface first.
  const sortedCardOptions = React.useMemo<CardRow[]>(
    () => managedCards.cards.filter((card) => card.active && card.name.trim()).reverse(),
    [managedCards.cards],
  )
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
  const [splitPayments, setSplitPayments] = React.useState<SplitPayment[]>([])
  const formId = React.useId()
  // Only one suggestion popover can be open at a time so the Description
  // and Category dropdowns don't visually overlap.
  const [activeMenu, setActiveMenu] = React.useState<'description' | 'category' | null>(null)
  const setMenu = (menu: 'description' | 'category') => (open: boolean) => setActiveMenu((current) => open ? menu : (current === menu ? null : current))

  React.useEffect(() => {
    if (!open) return
    const next = expense
      ? { date: expense.date, amount: expense.amount, description: expense.description, category: expense.category, paymentMethod: expense.paymentMethod, reimbursement: expense.reimbursement, tags: expense.tags }
      : template
        ? { ...template }
        : emptyForm()
    const matched = !expense && template?.description ? findLatestMatchingDescription(expensesQuery.data || [], template.description) : null
    if (matched) {
      if (!next.category) next.category = matched.category
      if (!next.paymentMethod) next.paymentMethod = matched.paymentMethod
    }
    const description = splitDescriptionNote(next.description)
    next.description = description.base
    setForm(next)
    setNote(description.note)
    setNoteOpen(Boolean(description.note))
    const parsedGiftcard = next.category === 'Giftcard' ? parseGiftcardDescription(next.description) : null
    setGiftcardParts(parsedGiftcard || emptyGiftcardParts())
    setGiftcardStructured(next.category !== 'Giftcard' || Boolean(parsedGiftcard) || !next.description)
    if (next.paymentMethod) {
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
    setSplitPayments([])
  }, [open, expense, template, expensesQuery.data, giftcards.merchants])

  const vendors = React.useMemo(() => Array.from(new Set(giftcards.cards.map((card) => card.vendor).filter(Boolean))).sort(), [giftcards.cards])
  const giftcardSources = React.useMemo(() => {
    const set = new Set<string>()
    for (const item of expensesQuery.data || []) {
      if (item.category !== 'Giftcard') continue
      const parsed = parseGiftcardDescription(item.description)
      if (parsed?.source) set.add(parsed.source)
    }
    return Array.from(set).sort()
  }, [expensesQuery.data])
  const activeMerchants = React.useMemo(() => [...giftcards.merchants].filter((merchant) => merchant.active && merchant.balance > 0.005).sort((a, b) => b.balance - a.balance || a.merchant.localeCompare(b.merchant)), [giftcards.merchants])
  const merchantOptions = React.useMemo(() => {
    const selected = giftcards.merchants.find((merchant) => merchant.merchant === selectedMerchant)
    return selected && !activeMerchants.some((merchant) => merchant.merchant === selected.merchant) ? [selected, ...activeMerchants] : activeMerchants
  }, [activeMerchants, giftcards.merchants, selectedMerchant])
  const selectedCards = React.useMemo(() => giftcards.cards.filter((card) => card.vendor === selectedMerchant).sort((a, b) => a.date.localeCompare(b.date)), [giftcards.cards, selectedMerchant])
  const giftcardPurchase = form.category === 'Giftcard'
  const splitEnabled = !giftcardPurchase && splitPayments.length > 0
  const zeroCostGiftcardEntry = giftcardPurchase && Boolean(expense) && Math.abs(Number(expense?.amount) || 0) < 0.005

  React.useEffect(() => {
    if (giftcardPurchase && splitPayments.length) setSplitPayments([])
  }, [giftcardPurchase, splitPayments.length])

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

  const setAmount = (value: string) => {
    const amount = Number(value)
    setForm((current) => ({ ...current, amount: Number.isFinite(amount) ? Math.abs(amount) : 0 }))
  }

  const updateSplitPayment = (id: string, patch: Partial<SplitPayment>) => {
    setSplitPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment))
  }

  const startSplitPayments = () => {
    setSplitPayments([
      newSplitPayment(form.amount || 0, { paymentType, paymentMethod: form.paymentMethod, selectedMerchant, selectedGiftcardCard }),
      newSplitPayment(0),
    ])
  }

  const addSplitPayment = () => {
    const remaining = fromCents(Math.max(0, cents(form.amount) - splitPayments.reduce((sum, payment) => sum + cents(Math.abs(payment.amount)), 0)))
    setSplitPayments((current) => [...current, newSplitPayment(remaining)])
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments((current) => current.filter((payment) => payment.id !== id))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = Math.abs(Number(form.amount))
    if (!Number.isFinite(amount) || (amount === 0 && !zeroCostGiftcardEntry)) return toast({ title: t('expense.amountRequired', 'Amount is required.'), variant: 'destructive' })
    if (!splitEnabled && !form.paymentMethod.trim()) return toast({ title: t('expense.paymentRequired', 'Payment method is required.'), variant: 'destructive' })
    if (giftcardPurchase && amount <= 0 && !zeroCostGiftcardEntry) return toast({ title: 'Giftcard purchase cost must be greater than zero.', variant: 'destructive' })
    if (giftcardPurchase && giftcardStructured && !giftcardParts.vendor.trim()) return toast({ title: 'Vendor is required for giftcard purchases.', variant: 'destructive' })
    if (!(giftcardPurchase && giftcardStructured) && !form.description.trim()) return toast({ title: t('expense.descriptionRequired', 'Description is required.'), variant: 'destructive' })
    const description = giftcardPurchase && giftcardStructured
      ? composeGiftcardDescription(giftcardParts, note)
      : appendNoteToDescription(form.description, note)
    const basePayload = { date: form.date, amount, description, category: form.category, paymentMethod: form.paymentMethod, reimbursement: form.reimbursement, tags: formatTags(form.tags) }
    let payloads = [basePayload]
    if (splitEnabled) {
      if (splitPayments.length < 2) return toast({ title: 'Add at least two payment methods.', variant: 'destructive' })
      const invalidAmount = splitPayments.find((payment) => cents(Math.abs(payment.amount)) <= 0)
      if (invalidAmount) return toast({ title: 'Each split amount must be greater than zero.', variant: 'destructive' })
      const missingMethod = splitPayments.find((payment) => !payment.paymentMethod.trim())
      if (missingMethod) return toast({ title: 'Every split needs a payment method.', variant: 'destructive' })
      const splitTotal = splitPayments.reduce((sum, payment) => sum + cents(Math.abs(payment.amount)), 0)
      const expectedTotal = cents(amount)
      if (splitTotal !== expectedTotal) {
        const difference = fromCents(expectedTotal - splitTotal)
        return toast({
          title: 'Split amounts must add up.',
          description: `You are ${difference > 0 ? 'short' : 'over'} by ${currency.format(Math.abs(difference))}.`,
          variant: 'destructive',
        })
      }
      payloads = splitPayments.map((payment) => ({
        ...basePayload,
        amount: fromCents(cents(Math.abs(payment.amount))),
        paymentMethod: payment.paymentMethod.trim(),
      }))
    }
    if (!expense && payloads.some((payload) => (expensesQuery.data || []).some((item) => sameExpense(payload, item))) && !window.confirm('This looks like a duplicate expense. Add it anyway?')) return
    try {
      if (expense && splitEnabled) {
        const [firstPayload, ...extraPayloads] = payloads
        await updateExpense.mutateAsync({ ...firstPayload, rowIndex: expense.rowIndex })
        for (const payload of extraPayloads) await addExpense.mutateAsync(payload)
      } else if (expense) await updateExpense.mutateAsync({ ...basePayload, rowIndex: expense.rowIndex })
      else {
        for (const payload of payloads) await addExpense.mutateAsync(payload)
      }
      toast({ title: splitEnabled ? (expense ? `Expense split into ${payloads.length} rows` : `Added ${payloads.length} expense rows`) : expense ? t('expense.updated', 'Expense updated') : t('expense.added', 'Expense added') })
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Could not save expense', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const saving = addExpense.isPending || updateExpense.isPending
  const descriptionSuggestions = React.useMemo(() => buildDescriptionSuggestions(expensesQuery.data || [], form.category), [expensesQuery.data, form.category])
  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={expense ? t('expense.editTitle', 'Edit expense') : t('expense.addTitle', 'Add expense')}
    description={t('expense.savedToSheet', 'Saved directly to your Google Sheet')}
    className="overflow-x-hidden"
    mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('expense.cancel', 'Cancel')}</Button><Button type="submit" form={formId} variant="gradient" disabled={saving}>{saving ? t('expense.saving', 'Saving...') : (expense ? t('expense.saveChanges', 'Save changes') : t('expense.addExpense', 'Add expense'))}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid w-full min-w-0 max-w-full gap-x-5 gap-y-3 px-0.5 pb-0.5 sm:grid-cols-2 sm:gap-y-4">
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="flex min-w-0 items-center justify-between gap-2"><span>{t('expense.date', 'Date')}</span><DateQuickChips className="justify-end" selected={form.date} onPick={(date) => setForm({ ...form, date })} /></span><Input className="min-w-0 max-w-full appearance-none" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <div className="space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span>{t('expense.description', 'Description')}</span>
          {noteOpen
            ? <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 px-0 py-0 text-muted-foreground hover:bg-transparent hover:text-coral" onClick={() => { setNote(''); setNoteOpen(false) }}>{t('expense.removeNote', 'Remove note')}</Button>
            : <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 px-0 py-0 text-coral hover:bg-transparent" onClick={() => setNoteOpen(true)}>{t('expense.addNote', '+ Add note')}</Button>}
        </span>
        {giftcardPurchase
          ? <GiftcardComposer parts={giftcardParts} structured={giftcardStructured} vendors={vendors} sources={giftcardSources} rawDescription={form.description} paidAmount={Number(form.amount) || 0} onRawChange={(description) => setForm({ ...form, description })} onStructuredChange={setGiftcardStructured} onChange={setGiftcardParts} />
          : <DescriptionAutosuggest value={form.description} onChange={(description) => setForm({ ...form, description })} suggestions={descriptionSuggestions} currentCategory={form.category} placeholder={t('expense.descriptionPlaceholder', 'Groceries, rent, coffee...')} isOpen={activeMenu === 'description'} onOpenChange={setMenu('description')} />}
        {noteOpen && <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('expense.notePlaceholder', 'Note: chase 10%, shared dinner...')} />}
      </div>
      <AmountInputWithCalculator label={giftcardPurchase ? t('expense.costPaid', 'Cost paid') : t('expense.amount', 'Amount')} value={form.amount} onChange={setAmount} allowZero={zeroCostGiftcardEntry} />
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">{t('expense.category', 'Category')}</span><CategoryCombobox value={form.category} onChange={setCategory} options={categories} placeholder={t('expense.categoryPlaceholder', 'Choose or type a category')} isOpen={activeMenu === 'category'} onOpenChange={setMenu('category')} /></label>
      <div className={cn('min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground', splitEnabled && 'sm:col-span-2')}>
        {splitEnabled
          ? <SplitPaymentEditor
            total={form.amount}
            payments={splitPayments}
            cards={sortedCardOptions}
            merchants={activeMerchants}
            allMerchants={giftcards.merchants}
            giftcardCards={giftcards.cards}
            onAdd={addSplitPayment}
            onRemove={removeSplitPayment}
            onCancel={() => setSplitPayments([])}
            onChange={updateSplitPayment}
          />
          : <>
            <span className="block">{t('expense.paymentMethod', 'Payment method')}</span>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-accent/50 p-0.5">
              {paymentTypes.map((item) => <button key={item.type} type="button" aria-label={t(paymentTypeKey[item.type], item.label)} className={cn('flex h-9 items-center justify-center gap-1 rounded-full px-2 text-[11px] leading-none transition md:h-8 md:px-3 md:text-xs', paymentType === item.type ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')} onClick={() => {
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
              }} title={t(paymentTypeKey[item.type], item.label)}><span>{item.emoji}</span><span>{t(paymentTypeKey[item.type], item.label)}</span></button>)}
            </div>
            {paymentType !== 'cash' && <div className="pt-1.5">
              {paymentType === 'giftcard'
                ? <GiftcardPaymentPicker merchants={merchantOptions} cards={selectedCards} selectedMerchant={selectedMerchant} selectedCard={selectedGiftcardCard} onMerchantSelect={selectGiftcardMerchant} onCardSelect={selectGiftcardCard} />
                : <CardPaymentPicker value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} cards={sortedCardOptions} />}
            </div>}
            {!giftcardPurchase && <button
              type="button"
              className="mt-2 w-full rounded-2xl border border-dashed border-coral/35 bg-coral/5 px-3 py-2 text-left text-xs font-bold text-coral transition hover:bg-coral/10"
              onClick={startSplitPayments}
            >{t('expense.splitPayments', 'Split across multiple payment methods')}</button>}
          </>}
      </div>
      <div className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span className="block">{t('expense.tags', 'Tags')}</span>
        <TagsInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
      </div>
    </form>
  </Dialog>
}

function SplitPaymentEditor({
  total,
  payments,
  cards,
  merchants,
  allMerchants,
  giftcardCards,
  onAdd,
  onRemove,
  onCancel,
  onChange,
}: {
  total: number
  payments: SplitPayment[]
  cards: CardRow[]
  merchants: MerchantRow[]
  allMerchants: MerchantRow[]
  giftcardCards: GiftcardRow[]
  onAdd: () => void
  onRemove: (id: string) => void
  onCancel: () => void
  onChange: (id: string, patch: Partial<SplitPayment>) => void
}) {
  const totalCents = cents(total)
  const splitCents = payments.reduce((sum, payment) => sum + cents(Math.abs(payment.amount)), 0)
  const remainingCents = totalCents - splitCents
  const exact = totalCents > 0 && remainingCents === 0
  React.useEffect(() => {
    if (payments.length < 2) return
    const lastPayment = payments[payments.length - 1]
    const otherCents = payments.slice(0, -1).reduce((sum, payment) => sum + cents(Math.abs(payment.amount)), 0)
    const nextAmount = fromCents(Math.max(0, totalCents - otherCents))
    if (cents(lastPayment.amount) !== cents(nextAmount)) onChange(lastPayment.id, { amount: nextAmount })
  }, [onChange, payments, totalCents])
  const setType = (payment: SplitPayment, paymentType: PaymentMethodType) => {
    if (paymentType === 'cash') {
      onChange(payment.id, { paymentType, paymentMethod: 'Cash', selectedMerchant: '', selectedGiftcardCard: 'auto' })
      return
    }
    if (paymentType === 'giftcard') {
      const merchant = findMerchantForMethod(payment.paymentMethod, allMerchants) || payment.selectedMerchant
      const specificCard = merchant && payment.paymentMethod !== merchant ? payment.paymentMethod : ''
      onChange(payment.id, { paymentType, paymentMethod: merchant, selectedMerchant: merchant, selectedGiftcardCard: specificCard || 'auto' })
      return
    }
    onChange(payment.id, { paymentType, paymentMethod: classifyPaymentMethod(payment.paymentMethod) === 'card' ? payment.paymentMethod : '', selectedMerchant: '', selectedGiftcardCard: 'auto' })
  }
  const merchantOptionsFor = (selectedMerchant: string) => {
    const selected = allMerchants.find((merchant) => merchant.merchant === selectedMerchant)
    return selected && !merchants.some((merchant) => merchant.merchant === selected.merchant) ? [selected, ...merchants] : merchants
  }

  return <div className="space-y-3 rounded-3xl border border-border/70 bg-accent/25 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <span className="block text-sm font-extrabold text-foreground">Split payments</span>
        <span className={cn('mt-0.5 block text-xs font-semibold', exact ? 'text-emerald-600 dark:text-mint' : 'text-muted-foreground')}>
          {exact ? `Matches ${currency.format(fromCents(totalCents))}` : `${remainingCents > 0 ? 'Remaining' : 'Over'} ${currency.format(Math.abs(fromCents(remainingCents)))}`}
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-2 text-xs" onClick={onCancel}>Use one</Button>
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-2 text-xs" onClick={onAdd}>+ Add</Button>
      </div>
    </div>
    <div className="space-y-2">
      {payments.map((payment, index) => {
        const selectedCards = giftcardCards.filter((card) => card.vendor === payment.selectedMerchant).sort((a, b) => a.date.localeCompare(b.date))
        const isBalancingPayment = index === payments.length - 1 && payments.length > 1
        return <div key={payment.id} className="space-y-3 rounded-3xl border border-border/70 bg-card/80 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <label className="min-w-0 flex-1 space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">{isBalancingPayment ? 'Remaining amount' : `Amount ${index + 1}`}</span>
              <DecimalInput
                disabled={isBalancingPayment}
                className={isBalancingPayment ? 'bg-muted text-muted-foreground' : undefined}
                value={payment.amount}
                onChange={(rawValue) => {
                  const amount = Number(rawValue)
                  onChange(payment.id, { amount: Number.isFinite(amount) ? Math.abs(amount) : 0 })
                }}
              />
              {isBalancingPayment && <span className="block px-1 text-[11px] font-medium text-muted-foreground/80">Auto-filled from the total minus the other split amounts.</span>}
            </label>
            {payments.length > 2 && <button
              type="button"
              aria-label="Remove split payment"
              className="mt-6 grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold text-muted-foreground transition hover:bg-accent hover:text-coral"
              onClick={() => onRemove(payment.id)}
            >×</button>}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-accent/50 p-0.5">
            {paymentTypes.map((item) => <button
              key={item.type}
              type="button"
              aria-label={item.label}
              className={cn('flex h-9 items-center justify-center gap-1 rounded-full px-2 text-[11px] leading-none transition md:h-8 md:px-3 md:text-xs', payment.paymentType === item.type ? 'bg-card text-coral shadow-sm' : 'text-muted-foreground hover:bg-card/70')}
              onClick={() => setType(payment, item.type)}
              title={item.label}
            ><span>{item.emoji}</span><span>{item.label}</span></button>)}
          </div>
          {payment.paymentType !== 'cash' && <div className="pt-0.5">
            {payment.paymentType === 'giftcard'
              ? <GiftcardPaymentPicker
                merchants={merchantOptionsFor(payment.selectedMerchant)}
                cards={selectedCards}
                selectedMerchant={payment.selectedMerchant}
                selectedCard={payment.selectedGiftcardCard}
                onMerchantSelect={(merchant) => onChange(payment.id, { selectedMerchant: merchant, selectedGiftcardCard: 'auto', paymentMethod: merchant })}
                onCardSelect={(card) => onChange(payment.id, { selectedGiftcardCard: card, paymentMethod: card === 'auto' ? payment.selectedMerchant : card })}
              />
              : <CardPaymentPicker value={payment.paymentMethod} onChange={(paymentMethod) => onChange(payment.id, { paymentMethod })} cards={cards} />}
          </div>}
        </div>
      })}
    </div>
  </div>
}

export function ReturnDialog({ open, onOpenChange, original, returnExpense }: { open: boolean; onOpenChange: (open: boolean) => void; original?: Expense | null; returnExpense?: Expense | null }) {
  const giftcards = useGiftcards()
  const managedCards = useCards()
  const expenses = useExpenses()
  const addExpense = useAddExpense()
  const updateExpense = useUpdateExpense()
  const { toast } = useToast()
  const sortedCardOptions = React.useMemo<CardRow[]>(
    () => managedCards.cards.filter((card) => card.active && card.name.trim()).reverse(),
    [managedCards.cards],
  )
  const source = returnExpense || original
  const linkedOriginal = React.useMemo(() => original || (returnExpense ? findOriginalExpenseForReturn(returnExpense, expenses.data || []) : null), [original, returnExpense, expenses.data])
  const originalAmount = Math.abs(linkedOriginal?.amount || 0)
  const returnSummary = React.useMemo(() => linkedOriginal ? getReturnSummary(linkedOriginal, expenses.data || [], returnExpense?.rowIndex) : null, [linkedOriginal, expenses.data, returnExpense?.rowIndex])
  const maxReturnAmount = returnSummary ? returnSummary.remaining : originalAmount
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [fullRefund, setFullRefund] = React.useState(true)
  const [paymentType, setPaymentType] = React.useState<PaymentMethodType>('card')
  const [selectedMerchant, setSelectedMerchant] = React.useState('')
  const [selectedGiftcardCard, setSelectedGiftcardCard] = React.useState<'auto' | string>('auto')
  const [giftcardReturnMode, setGiftcardReturnMode] = React.useState<GiftcardReturnMode>('original')
  const [newGiftcardVendor, setNewGiftcardVendor] = React.useState('')
  const formId = React.useId()
  const originalGiftcardMerchant = original ? findMerchantForMethod(original.paymentMethod, giftcards.merchants) : ''
  const giftcardVendorOptions = React.useMemo(() => Array.from(new Set([
    ...giftcards.merchants.map((merchant) => ensureGiftcardVendor(merchant.merchant)),
    ...giftcards.cards.map((card) => ensureGiftcardVendor(card.vendor)),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [giftcards.cards, giftcards.merchants])
  const originalIsGiftcard = Boolean(original && (
    classifyPaymentMethod(original.paymentMethod) === 'giftcard' ||
    originalGiftcardMerchant ||
    giftcards.cards.some((card) => original.paymentMethod === methodForCard(card) || original.paymentMethod === card.vendor)
  ))

  React.useEffect(() => {
    if (!open || !source) return
    const amount = Math.abs(returnExpense?.amount ?? maxReturnAmount)
    const paymentMethod = source.paymentMethod
    const merchant = findMerchantForMethod(paymentMethod, giftcards.merchants) || ''
    const defaultStoreCreditVendor = merchant ? ensureGiftcardVendor(merchant) : ''
    setForm({
      date: returnExpense?.date || todayIso(),
      amount,
      description: returnExpense?.description || (original ? returnDescription(original) : 'Return'),
      category: source.category,
      paymentMethod,
      reimbursement: '',
      tags: returnExpense?.tags || original?.tags || '',
    })
    setFullRefund(Boolean(original && !returnExpense))
    setGiftcardReturnMode('original')
    setNewGiftcardVendor(defaultStoreCreditVendor)
    const inferredPaymentType = classifyPaymentMethod(paymentMethod)
    const specificCard = merchant && paymentMethod !== merchant ? paymentMethod : ''
    setPaymentType(inferredPaymentType)
    setSelectedMerchant(merchant)
    setSelectedGiftcardCard(specificCard || 'auto')
  }, [open, original, returnExpense, source, giftcards.merchants, maxReturnAmount])

  if (!source) return null

  const merchantOptions = (() => {
    const active = [...giftcards.merchants].filter((merchant) => merchant.active && merchant.balance > 0.005).sort((a, b) => b.balance - a.balance || a.merchant.localeCompare(b.merchant))
    const selected = giftcards.merchants.find((merchant) => merchant.merchant === selectedMerchant)
    return selected && !active.some((merchant) => merchant.merchant === selected.merchant) ? [selected, ...active] : active
  })()
  const selectedCards = giftcards.cards.filter((card) => card.vendor === selectedMerchant).sort((a, b) => a.date.localeCompare(b.date))

  const selectGiftcardMerchant = (merchant: string) => {
    setSelectedMerchant(merchant)
    setSelectedGiftcardCard('auto')
    setForm((current) => ({ ...current, paymentMethod: merchant }))
  }

  const selectGiftcardCard = (card: 'auto' | string) => {
    setSelectedGiftcardCard(card)
    setForm((current) => ({ ...current, paymentMethod: card === 'auto' ? selectedMerchant : card }))
  }

  const setAmount = (value: string) => {
    const amount = Number(value)
    setForm((current) => ({ ...current, amount: Number.isFinite(amount) ? Math.abs(amount) : 0 }))
  }

  const toggleFullRefund = () => {
    const next = !fullRefund
    setFullRefund(next)
    if (next && maxReturnAmount > 0) setForm((current) => ({ ...current, amount: maxReturnAmount }))
  }

  const chooseGiftcardReturnMode = (mode: GiftcardReturnMode) => {
    setGiftcardReturnMode(mode)
    if (mode === 'original' && original) {
      const inferredPaymentType = classifyPaymentMethod(original.paymentMethod)
      setPaymentType(inferredPaymentType)
      setForm((current) => ({ ...current, paymentMethod: original.paymentMethod }))
      const merchant = findMerchantForMethod(original.paymentMethod, giftcards.merchants) || ''
      const specificCard = merchant && original.paymentMethod !== merchant ? original.paymentMethod : ''
      setSelectedMerchant(merchant)
      setSelectedGiftcardCard(specificCard || 'auto')
    } else {
      const paymentMethod = original?.paymentMethod || form.paymentMethod
      setPaymentType(classifyPaymentMethod(paymentMethod))
      setForm((current) => ({ ...current, paymentMethod }))
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = fullRefund && maxReturnAmount > 0 ? maxReturnAmount : Math.abs(Number(form.amount))
    const zeroAmountReturnEdit = Boolean(returnExpense && Math.abs(Number(returnExpense.amount) || 0) < 0.005)
    if (!Number.isFinite(amount) || (amount === 0 && !zeroAmountReturnEdit)) return toast({ title: 'Return amount is required.', variant: 'destructive' })
    if (maxReturnAmount > 0 && amount - maxReturnAmount > 0.005) return toast({ title: 'Return amount is more than the remaining purchase.', description: `Only ${currency.format(maxReturnAmount)} remains after other returns.`, variant: 'destructive' })
    const creatingNewGiftcard = giftcardReturnMode === 'new' && !returnExpense
    const refundPaymentMethod = creatingNewGiftcard ? (original?.paymentMethod || form.paymentMethod) : form.paymentMethod
    const payload = { date: form.date, amount: -amount, description: form.description, category: form.category, paymentMethod: refundPaymentMethod, reimbursement: '', tags: formatTags(form.tags) }
    const giftcardVendorInput = newGiftcardVendor.trim()
    const giftcardVendor = ensureGiftcardVendor(giftcardVendorInput)
    try {
      if (returnExpense) await updateExpense.mutateAsync({ ...payload, rowIndex: returnExpense.rowIndex })
      else if (creatingNewGiftcard) {
        if (!giftcardVendorInput) return toast({ title: 'Giftcard name is required.', variant: 'destructive' })
        await addExpense.mutateAsync({
          date: form.date,
          amount: 0,
          description: composeGiftcardDescription({ vendor: giftcardVendor, face: String(Number(amount.toFixed(2))), source: original ? returnDescription(original) : `Return (${form.date})` }),
          category: 'Giftcard',
          paymentMethod: refundPaymentMethod,
          reimbursement: '',
          tags: formatTags(form.tags),
        })
      } else await addExpense.mutateAsync(payload)
      toast({ title: returnExpense ? 'Return updated' : creatingNewGiftcard ? 'Giftcard added' : 'Return added' })
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Could not save return', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    }
  }

  const saving = addExpense.isPending || updateExpense.isPending
  const currentReturnAmount = fullRefund && maxReturnAmount > 0 ? maxReturnAmount : Math.abs(Number(form.amount) || 0)
  const returnedAfterThis = (returnSummary?.returned || 0) + currentReturnAmount
  const remainingAfterThis = Math.max(0, originalAmount - returnedAfterThis)
  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={returnExpense ? 'Edit return' : 'Add return'}
    description={linkedOriginal ? `${linkedOriginal.description || linkedOriginal.category || 'Purchase'} · ${linkedOriginal.date} · ${currency.format(originalAmount)}` : 'Saved as a negative row in your Google Sheet.'}
    className="overflow-x-hidden"
    mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form={formId} variant="gradient" disabled={saving}>{saving ? 'Saving...' : (returnExpense ? 'Save return' : 'Add return')}</Button></div>}
  >
    <form id={formId} onSubmit={submit} className="grid w-full min-w-0 max-w-full gap-x-5 gap-y-4 px-0.5 pb-0.5 sm:grid-cols-2">
      {linkedOriginal && <button type="button" aria-pressed={fullRefund} onClick={toggleFullRefund} className={cn('flex items-center gap-3 rounded-3xl border p-3 text-left transition sm:col-span-2', fullRefund ? 'border-mint/40 bg-mint/10 text-emerald-700 dark:text-mint' : 'border-border bg-accent/35 text-foreground hover:bg-accent/60')}>
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold', fullRefund ? 'border-mint bg-mint text-white' : 'border-muted-foreground/40 text-transparent')}>✓</span>
        <span className="min-w-0"><span className="block text-sm font-extrabold">Full refund</span><span className="block text-xs font-medium text-muted-foreground">Use the remaining purchase amount: {currency.format(maxReturnAmount)}</span></span>
      </button>}
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Return date</span><Input className="min-w-0 max-w-full appearance-none" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><DateQuickChips selected={form.date} onPick={(date) => setForm({ ...form, date })} /></label>
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">Return amount</span><DecimalInput className={cn('min-w-0 max-w-full', fullRefund && 'bg-muted text-muted-foreground')} required disabled={fullRefund} value={fullRefund && maxReturnAmount > 0 ? maxReturnAmount : form.amount} onChange={setAmount} />{fullRefund ? <span className="block px-1 text-[11px] font-medium text-muted-foreground/80">Amount is locked for the remaining refund.</span> : <span className="block px-1 text-[11px] font-medium text-muted-foreground/80">Enter a positive partial refund amount.</span>}</label>
      {linkedOriginal && <div className="rounded-3xl border border-mint/30 bg-mint/10 p-3 text-sm sm:col-span-2">
        <p className="font-extrabold text-emerald-700 dark:text-mint">Return balance</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">Original {currency.format(originalAmount)} · already returned {currency.format(returnSummary?.returned || 0)} · after this return left {currency.format(remainingAfterThis)}</p>
      </div>}
      <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2"><span className="block">Description</span><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Return: purchase description (date)" /></label>
      <div className="rounded-3xl border border-border/70 bg-accent/35 p-3 text-sm sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Category</p><p className="mt-1 font-semibold text-foreground">{form.category || 'Uncategorized'}</p></div>
      {original && !returnExpense && (originalIsGiftcard || giftcardReturnMode === 'new') && <div className="space-y-3 rounded-3xl border border-border/70 bg-accent/25 p-3 sm:col-span-2">
        {giftcardReturnMode === 'new'
          ? <>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">New giftcard / store credit</p><p className="mt-1 text-xs font-medium text-muted-foreground">Creates one giftcard entry and keeps the original payment method on that entry.</p></div>{originalIsGiftcard && <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-2 text-xs" onClick={() => chooseGiftcardReturnMode('original')}>Use original giftcard</Button>}</div>
            <div className="grid gap-3 rounded-2xl bg-card/70 p-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground"><span className="block">New giftcard name</span><StringAutosuggest value={newGiftcardVendor} onChange={setNewGiftcardVendor} options={giftcardVendorOptions} placeholder="Select or type giftcard name" /></label>
            <div className="rounded-2xl bg-mint/10 p-3 text-xs font-semibold text-emerald-700 dark:text-mint">
              <p>Will add one entry: {newGiftcardVendor.trim() ? ensureGiftcardVendor(newGiftcardVendor) : 'Choose a giftcard name'} · Face {currency.format(fullRefund && originalAmount > 0 ? originalAmount : Math.abs(Number(form.amount) || 0))} · Paid $0.00</p>
              <p className="mt-1 text-muted-foreground">Paid by: {original?.paymentMethod || form.paymentMethod}</p>
              <p className="mt-1 text-muted-foreground">Source: {original ? returnDescription(original) : `Return (${form.date})`}</p>
            </div>
          </div></>
          : <>
            <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Giftcard refund</p><p className="mt-1 text-xs font-medium text-muted-foreground">Choose whether the store puts value back on the old giftcard or issues new store credit.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed onClick={() => chooseGiftcardReturnMode('original')} className="rounded-2xl border border-coral/40 bg-coral/10 p-3 text-left text-coral transition">
                <span className="block text-sm font-extrabold">Original giftcard</span>
                <span className="mt-1 block text-xs font-medium text-muted-foreground">{original?.paymentMethod}</span>
              </button>
              <button type="button" aria-pressed={false} onClick={() => chooseGiftcardReturnMode('new')} className="rounded-2xl border border-border bg-card/60 p-3 text-left transition hover:bg-card">
                <span className="block text-sm font-extrabold">New giftcard / store credit</span>
                <span className="mt-1 block text-xs font-medium text-muted-foreground">Creates one store-credit giftcard entry.</span>
              </button>
            </div>
            <div className="rounded-2xl bg-card/70 p-3 text-xs font-semibold text-muted-foreground">The negative return row will use the original giftcard payment method so the existing giftcard balance gets restored.</div>
          </>}
      </div>}
      {((!originalIsGiftcard && giftcardReturnMode !== 'new') || returnExpense) && <div className="min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span className="block">Refund to</span>
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
        {paymentType !== 'cash' && <div className="pt-1.5">
          {paymentType === 'giftcard'
            ? <GiftcardPaymentPicker merchants={merchantOptions} cards={selectedCards} selectedMerchant={selectedMerchant} selectedCard={selectedGiftcardCard} onMerchantSelect={selectGiftcardMerchant} onCardSelect={selectGiftcardCard} />
            : <CardPaymentPicker value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} cards={sortedCardOptions} />}
        </div>}
        {original && !returnExpense && <button type="button" onClick={() => chooseGiftcardReturnMode('new')} className="mt-2 w-full rounded-2xl border border-dashed border-coral/40 bg-coral/5 px-3 py-2 text-left text-xs font-bold text-coral transition hover:bg-coral/10">Create new giftcard / store credit instead</button>}
      </div>}
      <div className="block min-w-0 space-y-1.5 text-sm font-semibold text-muted-foreground sm:col-span-2">
        <span className="block">Tags</span>
        <TagsInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
      </div>
    </form>
  </Dialog>
}

function CategoryCombobox({ value, onChange, options, placeholder = 'Choose or type a category', isOpen, onOpenChange }: { value: string; onChange: (value: string) => void; options: string[]; placeholder?: string; isOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next
    if (isOpen === undefined) setInternalOpen(resolved)
    onOpenChange?.(resolved)
  }
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
    {open && (visibleOptions.length > 0 || !exactMatch) && <FadeScroll
      id={id}
      role="listbox"
      outerClassName="absolute z-40 mt-1 w-full rounded-3xl border border-border/70 bg-card shadow-lift"
      className="max-h-56 overflow-y-auto p-1.5"
    >
      {visibleOptions.map((option) => <button key={option} type="button" role="option" aria-selected={option === value} className={cn('w-full rounded-2xl px-3 py-2 text-left text-sm font-medium transition hover:bg-coral/5', option === value ? 'bg-coral/10 text-coral' : 'text-foreground')} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}
      {!visibleOptions.length && <p className="px-3 py-2 text-xs font-medium text-muted-foreground">No matches. Keep typing to add a new category.</p>}
    </FadeScroll>}
  </div>
}

function GiftcardComposer({ parts, structured, vendors, sources, rawDescription, paidAmount, onChange, onRawChange, onStructuredChange }: { parts: GiftcardDescriptionParts; structured: boolean; vendors: string[]; sources: string[]; rawDescription: string; paidAmount: number; onChange: (parts: GiftcardDescriptionParts) => void; onRawChange: (description: string) => void; onStructuredChange: (structured: boolean) => void }) {
  const hasOptional = Boolean(parts.face.trim() || parts.source.trim())
  const [showOptional, setShowOptional] = React.useState(hasOptional)
  React.useEffect(() => { if (hasOptional) setShowOptional(true) }, [hasOptional])
  if (!structured) return <div className="space-y-2"><Input value={rawDescription} onChange={(event) => onRawChange(event.target.value)} placeholder="Giftcard description" /><Button type="button" variant="outline" size="sm" onClick={() => { onChange(parseGiftcardDescription(rawDescription) || emptyGiftcardParts()); onStructuredChange(true) }}>Switch to structured</Button></div>
  const faceNumber = Number(parts.face)
  const savings = Number.isFinite(faceNumber) && faceNumber > 0 && paidAmount > 0 ? faceNumber - paidAmount : 0
  return <div className="space-y-2">
    <label className="block space-y-1"><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</span><StringAutosuggest value={parts.vendor} onChange={(vendor) => onChange({ ...parts, vendor })} options={vendors} placeholder="e.g. H&M GC" /></label>
    {!showOptional && <button type="button" onClick={() => setShowOptional(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-coral transition motion-safe:active:scale-[0.97] hover:bg-coral/10">+ Add face value or source</button>}
    {showOptional && <div className="grid gap-3 sm:grid-cols-3">
      <label className="block space-y-1"><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Face value <span className="font-normal normal-case text-muted-foreground/70">· optional</span></span><Input inputMode="decimal" type="number" min="0" step="0.01" value={parts.face} onChange={(event) => onChange({ ...parts, face: event.target.value })} placeholder="e.g. 50" /></label>
      <label className="block space-y-1 sm:col-span-2"><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source <span className="font-normal normal-case text-muted-foreground/70">· optional</span></span><StringAutosuggest value={parts.source} onChange={(source) => onChange({ ...parts, source })} options={sources} placeholder="e.g. Office Depot" /></label>
    </div>}
    {savings > 0.005 && <p className="px-1 text-xs font-semibold text-emerald-600 dark:text-mint">You'll bank {currency.format(savings)} ({((savings / faceNumber) * 100).toFixed(0)}% off face).</p>}
  </div>
}

function GiftcardPaymentPicker({ merchants, cards, selectedMerchant, selectedCard, onMerchantSelect, onCardSelect }: { merchants: MerchantRow[]; cards: GiftcardRow[]; selectedMerchant: string; selectedCard: 'auto' | string; onMerchantSelect: (merchant: string) => void; onCardSelect: (card: 'auto' | string) => void }) {
  const orderedCards = React.useMemo(() => [...cards].sort((a, b) => Number(a.balance <= 0.005) - Number(b.balance <= 0.005) || a.date.localeCompare(b.date)), [cards])
  return <div className="grid gap-3 rounded-3xl border border-border/70 bg-white/70 p-3 dark:bg-card/70 md:grid-cols-2">
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Merchant</span>
      <Select value={selectedMerchant} onChange={(event) => onMerchantSelect(event.target.value)}>
        <option value="">Select merchant…</option>
        {merchants.map((merchant) => <option key={merchant.merchant} value={merchant.merchant}>{merchant.merchant} — {currency.format(merchant.balance)} left · {merchant.cardCount} card{merchant.cardCount === 1 ? '' : 's'}</option>)}
      </Select>
    </label>
    {!merchants.length && <p className="rounded-2xl bg-accent/50 p-3 text-xs font-medium md:col-span-2">No active giftcards found.</p>}
    {selectedMerchant && <label className="block min-w-0 space-y-1.5 transition-all duration-200 ease-out">
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

function ensureGiftcardVendor(value: string) {
  const vendor = value.trim()
  if (!vendor) return 'Store GC'
  return classifyPaymentMethod(vendor) === 'giftcard' ? vendor : `${vendor} GC`
}

function findMerchantForMethod(paymentMethod: string, merchants: MerchantRow[]) {
  return [...merchants].sort((a, b) => b.merchant.length - a.merchant.length).find((merchant) => paymentMethod === merchant.merchant || paymentMethod.startsWith(`${merchant.merchant} (`) || paymentMethod.startsWith(`${merchant.merchant} #`))?.merchant
}

function describeCard(card: CardRow) {
  const tail = card.last4 ? ` ••${card.last4}` : ''
  const issuer = card.issuer ? ` — ${card.issuer}` : ''
  return `${card.name}${tail}${issuer}`
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase()
}

function CardPaymentPicker({ value, onChange, cards }: { value: string; onChange: (value: string) => void; cards: CardRow[] }) {
  const [focused, setFocused] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlight, setHighlight] = React.useState(0)
  const blurTimerRef = React.useRef<number | null>(null)
  const listId = React.useId()
  const selectedCard = React.useMemo(() => cards.find((card) => card.name === value), [cards, value])
  const existingOption = value && !selectedCard ? value : ''
  const normalizedQuery = normalizeSearch(query)
  const filteredCards = React.useMemo(() => {
    const ranked = cards.filter((card) => {
      if (!normalizedQuery) return true
      return normalizeSearch(`${card.name} ${card.issuer} ${card.last4}`).includes(normalizedQuery)
    })
    return ranked
  }, [cards, normalizedQuery])
  const showExistingOption = Boolean(existingOption && (!normalizedQuery || normalizeSearch(existingOption).includes(normalizedQuery)))
  const optionCount = filteredCards.length + (showExistingOption ? 1 : 0)
  const displayValue = focused ? query : (selectedCard ? describeCard(selectedCard) : value)

  React.useEffect(() => { setHighlight(0) }, [query, focused])
  React.useEffect(() => () => { if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current) }, [])

  const close = () => {
    setFocused(false)
    setQuery('')
  }
  const pick = (nextValue: string) => {
    onChange(nextValue)
    close()
  }
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!focused || optionCount === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => (current + 1) % optionCount)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => (current <= 0 ? optionCount - 1 : current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (showExistingOption && highlight === 0) pick(existingOption)
      else {
        const index = highlight - (showExistingOption ? 1 : 0)
        const card = filteredCards[index]
        if (card) pick(card.name)
      }
    } else if (event.key === 'Escape') {
      close()
    }
  }
  const open = focused && optionCount > 0

  return <div className="space-y-1.5">
    <div className="relative">
      <Input
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        value={displayValue}
        onChange={(event) => { setQuery(event.target.value); setFocused(true) }}
        onFocus={() => {
          if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current)
          setQuery('')
          setFocused(true)
        }}
        onBlur={() => { blurTimerRef.current = window.setTimeout(close, 150) }}
        onKeyDown={onKeyDown}
        placeholder="Search cards..."
        autoComplete="off"
        className={value ? 'pr-10' : undefined}
      />
      {value && <button
        type="button"
        aria-label="Clear card"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-xs font-bold text-muted-foreground transition hover:bg-accent hover:text-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange('')}
      >×</button>}
      {open && <FadeScroll
        outerClassName="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-2xl border border-border bg-card shadow-lift"
        className="max-h-[min(22rem,45dvh)] overflow-auto p-1"
      >
        <div id={listId} role="listbox">
          {showExistingOption && <button
            type="button"
            role="option"
            aria-selected={highlight === 0}
            className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition', highlight === 0 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(existingOption)}
          >
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{existingOption}</span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">current</span>
          </button>}
          {filteredCards.map((card, index) => {
            const actualIndex = index + (showExistingOption ? 1 : 0)
            return <button
              key={`mc-${card.rowIndex}`}
              type="button"
              role="option"
              aria-selected={highlight === actualIndex}
              className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition', highlight === actualIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(card.name)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{card.name}</span>
                {(card.last4 || card.issuer) && <span className="block truncate text-xs font-medium text-muted-foreground">{[card.last4 ? `••${card.last4}` : '', card.issuer].filter(Boolean).join(' · ')}</span>}
              </span>
              {value === card.name && <span className="shrink-0 text-xs font-bold text-coral">Selected</span>}
            </button>
          })}
        </div>
      </FadeScroll>}
    </div>
    {!cards.length && <p className="rounded-2xl bg-accent/50 p-2 text-xs font-medium">Add cards in the Cards tab for faster picking.</p>}
  </div>
}
