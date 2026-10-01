import { normalizeDateCell } from './dates'
import type { Expense } from './types'

export type PaymentMethodType = 'giftcard' | 'cash' | 'card'

export type GiftcardDescriptionParts = {
  vendor: string
  face: string
  source: string
}

export type GiftcardIdentity = { card: string; vendor: string; date: string; id?: string; aliases?: string[]; rowIndex?: number; sourceRowIndex?: number; paid?: number; face?: number }

export function sameGiftcardName(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

export function legacyGiftcardMethod(card: GiftcardIdentity) {
  return `${card.vendor} (${card.date})`
}

function matchesGiftcardMethod(method: string, card: GiftcardIdentity) {
  const prefix = `${card.vendor} (`
  const value = method.trim()
  if (value.slice(0, prefix.length).toLocaleLowerCase() !== prefix.toLocaleLowerCase() || !value.endsWith(')')) return false
  const methodDate = normalizeDateCell(value.slice(prefix.length, -1))
  const cardDate = normalizeDateCell(card.date)
  return Boolean(methodDate && cardDate && methodDate === cardDate)
}

export function giftcardMethodForCard(card: GiftcardIdentity) {
  return card.id ? `${card.vendor} (${normalizeDateCell(card.date)}) [gc:${card.id}]` : `${card.vendor} (${normalizeDateCell(card.date)})`
}

export function cardForGiftcardMethod(method: string, cards: readonly GiftcardIdentity[]) {
  const id = method.match(/\[gc:([a-z\d_-]+)\]\s*$/i)?.[1]
  if (id) return cards.find((card) => [card.id, ...(card.aliases || [])].some((value) => value === id))
  const matches = cards.filter((card) => sameGiftcardName(method, giftcardMethodForCard(card)) || matchesGiftcardMethod(method, card) || sameGiftcardName(method, card.card))
  return matches.length === 1 ? matches[0] : undefined
}

export function resolveGiftcardMethod(method: string, cards: readonly GiftcardIdentity[]) {
  if (/\[gc:[a-z\d_-]+\]\s*$/i.test(method)) {
    const card = cardForGiftcardMethod(method, cards)
    return card ? giftcardMethodForCard(card) : method
  }
  const canonicalMatch = cards.find((card) => sameGiftcardName(method, giftcardMethodForCard(card)))
  if (canonicalMatch) return giftcardMethodForCard(canonicalMatch)
  const legacyMatches = cards.filter((card) => matchesGiftcardMethod(method, card))
  if (legacyMatches.length === 1) return giftcardMethodForCard(legacyMatches[0])
  const descriptionMatches = cards.filter((card) => sameGiftcardName(method, card.card))
  if (descriptionMatches.length !== 1) return method
  const matchedCard = descriptionMatches[0]
  const identityMatches = cards.filter((card) => sameGiftcardName(card.vendor, matchedCard.vendor) && normalizeDateCell(card.date) === normalizeDateCell(matchedCard.date))
  return identityMatches.length === 1 ? giftcardMethodForCard(matchedCard) : method
}

function cents(value: number) { return Math.round((Number(value) || 0) * 100) }
function dollars(value: number) { return value / 100 }
function vendorKey(value: string) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() }

export function allocateGiftcardLedger<T extends GiftcardIdentity>(cards: readonly T[], expenses: readonly Expense[]) {
  const sortedCards = cards.map((card, index) => ({ card, index, remaining: cents(card.face || 0), direct: 0, fifo: 0, poolUsed: 0 }))
    .sort((a, b) => normalizeDateCell(a.card.date).localeCompare(normalizeDateCell(b.card.date)) || (a.card.sourceRowIndex || a.card.rowIndex || a.index) - (b.card.sourceRowIndex || b.card.rowIndex || b.index) || String(a.card.id || '').localeCompare(String(b.card.id || '')))
  const byId = new Map<string, typeof sortedCards[number]>()
  for (const item of sortedCards) for (const id of [item.card.id, ...(item.card.aliases || [])]) if (id) byId.set(id, item)
  const explicitTotals = new Map<typeof sortedCards[number], number>()
  const singleTotals = new Map<typeof sortedCards[number], number>()
  const directByGroup = new Map<string, { items: typeof sortedCards; total: number }>()
  const poolByVendor = new Map<string, number>()

  for (const expense of [...expenses].sort((a, b) => a.rowIndex - b.rowIndex)) {
    if (expense.amount === 0) continue
    const method = expense.paymentMethod.trim()
    const id = method.match(/\[gc:([a-z\d_-]+)\]\s*$/i)?.[1]
    if (id) {
      const target = byId.get(id)
      if (target) explicitTotals.set(target, (explicitTotals.get(target) || 0) + cents(expense.amount))
      continue
    }
    const directMatches = sortedCards.filter(({ card }) => sameGiftcardName(method, card.card) || matchesGiftcardMethod(method, card))
    if (directMatches.length) {
      if (directMatches.length === 1) {
        singleTotals.set(directMatches[0], (singleTotals.get(directMatches[0]) || 0) + cents(expense.amount))
        continue
      }
      const key = directMatches.map((item) => item.card.id || `${item.card.vendor}|${normalizeDateCell(item.card.date)}`).join('|')
      const current = directByGroup.get(key) || { items: directMatches, total: 0 }
      current.total += cents(expense.amount)
      directByGroup.set(key, current)
      continue
    }
    const vendor = sortedCards.find(({ card }) => vendorKey(method) === vendorKey(card.vendor))
    if (vendor) poolByVendor.set(vendorKey(vendor.card.vendor), (poolByVendor.get(vendorKey(vendor.card.vendor)) || 0) + cents(expense.amount))
  }

  for (const [item, total] of explicitTotals) { item.direct += total; item.remaining -= total }
  for (const [item, total] of singleTotals) { item.direct += total; item.remaining -= total }

  for (const { items, total } of directByGroup.values()) {
    let left = total
    if (left >= 0) {
      for (const item of items) {
        const used = Math.min(left, Math.max(0, item.remaining))
        item.direct += used
        item.remaining -= used
        left -= used
        if (!left) break
      }
    } else {
      for (const item of items) {
        const restored = Math.min(-left, Math.max(0, item.direct))
        item.direct -= restored
        item.remaining += restored
        left += restored
        if (!left) break
      }
    }
    if (left) {
      const target = total >= 0 ? items[items.length - 1] : items[0]
      target.direct += left
      target.remaining -= left
    }
  }

  const usedByVendor = new Map<string, typeof sortedCards>()
  for (const item of sortedCards) {
    const key = vendorKey(item.card.vendor)
    const group = usedByVendor.get(key) || []
    group.push(item)
    usedByVendor.set(key, group)
  }
  for (const [vendor, netSpend] of poolByVendor) {
    const group = usedByVendor.get(vendor) || []
    if (netSpend > 0) {
      let left = netSpend
      for (const item of group) {
        const used = Math.min(left, Math.max(0, item.remaining))
        item.remaining -= used
        item.fifo += used
        item.poolUsed += used
        left -= used
        if (!left) break
      }
      if (left && group.length) {
        group[group.length - 1].remaining -= left
        group[group.length - 1].fifo += left
      }
    } else {
      let left = -netSpend
      for (const item of group) {
        const restored = Math.min(left, item.fifo)
        item.poolUsed = Math.max(0, item.poolUsed - restored)
        item.fifo -= restored
        item.remaining += restored
        left -= restored
        if (!left) break
      }
      if (left && group.length) {
        group[0].remaining += left
        group[0].fifo -= left
      }
    }
  }

  let pooledBefore = 0
  return sortedCards.map((item) => {
    const cumBefore = pooledBefore
    pooledBefore += item.fifo
    return { ...item.card, direct: dollars(item.direct), pool: dollars(item.fifo), cumBefore: dollars(cumBefore), fifo: dollars(item.fifo), balance: dollars(item.remaining) }
  })
}

function purchaseKey(date: string, paid: number) {
  return [normalizeDateCell(date), cents(paid)].join('|')
}

export function giftcardSourcePurchaseRowIndexes(expenses: readonly Expense[]) {
  return expenses.filter((expense) => expense.rowIndex > 0 && expense.amount >= 0 && expense.category.trim().toLocaleLowerCase() === 'giftcard').map((expense) => expense.rowIndex)
}

export function giftcardActiveColumnIsComputed(formulas: readonly string[][]) {
  return formulas.some((row) => /^\s*=/.test(row[0] || '') && /\b(?:MAP|ARRAYFORMULA|BYROW)\s*\(/i.test(row[0] || ''))
}

export function giftcardRowsMissingMetadata(purchaseRows: readonly number[], idsByRow: ReadonlyMap<number, readonly string[]>) {
  return [...new Set(purchaseRows)].filter((rowIndex) => !idsByRow.get(rowIndex)?.length)
}

export function matchGiftcardSourcePurchases<T extends GiftcardIdentity & { paid: number; face: number; rowIndex: number }>(cards: readonly T[], expenses: readonly Expense[], idsByExpenseRow: ReadonlyMap<number, readonly string[]>) {
  const purchases = new Map<string, Expense[]>()
  for (const expense of expenses) {
    if (expense.rowIndex < 1 || expense.amount < 0 || expense.category.trim().toLocaleLowerCase() !== 'giftcard') continue
    const key = purchaseKey(expense.date, expense.amount)
    const rows = purchases.get(key) || []
    rows.push(expense)
    purchases.set(key, rows)
  }
  for (const rows of purchases.values()) rows.sort((a, b) => a.rowIndex - b.rowIndex)
  return [...cards].sort((a, b) => a.rowIndex - b.rowIndex).map((card) => {
    const key = purchaseKey(card.date, card.paid)
    const rows = purchases.get(key) || []
    let sourceIndex = rows.findIndex((expense) => sameGiftcardName(expense.description.trim(), card.card.trim()))
    if (sourceIndex < 0) sourceIndex = rows.findIndex((expense) => {
      const parsed = parseGiftcardDescription(expense.description)
      if (parsed) return vendorKey(parsed.vendor) === vendorKey(card.vendor) && (!parsed.face || cents(parseCurrency(parsed.face)) === cents(card.face))
      return vendorKey(expense.description).startsWith(vendorKey(card.vendor))
    })
    const source = sourceIndex >= 0 ? rows.splice(sourceIndex, 1)[0] : undefined
    const aliases = source ? [...new Set(idsByExpenseRow.get(source.rowIndex) || [])].sort() : []
    return { ...card, sourceRowIndex: source?.rowIndex, id: aliases[0], aliases }
  })
}

export function newGiftcardPurchaseId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function parseCurrency(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(String(value || '').replace(/[$,]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function classifyPaymentMethod(name: string): PaymentMethodType {
  if (/\bGC\b|\bGift/i.test(name)) return 'giftcard'
  if (/cash|venmo|zelle|paypal|apple pay|google pay/i.test(name)) return 'cash'
  return 'card'
}

export function classifyGiftcardPaymentMethod(name: string, cards: readonly GiftcardIdentity[]): PaymentMethodType {
  return Boolean(name.trim()) && cards.some((card) =>
    sameGiftcardName(name, card.vendor) ||
    sameGiftcardName(name, giftcardMethodForCard(card)) ||
    matchesGiftcardMethod(name, card) ||
    sameGiftcardName(name, card.card)
  )
    ? 'giftcard'
    : classifyPaymentMethod(name)
}

export function splitDescriptionNote(description: string) {
  const value = String(description || '').trim()
  const noteIndex = value.lastIndexOf(' #')
  if (noteIndex < 0) return { base: value, note: '' }
  return { base: value.slice(0, noteIndex).trim(), note: value.slice(noteIndex + 2).trim() }
}

export function appendNoteToDescription(description: string, note: string) {
  const base = String(description || '').trim()
  const cleanedNote = String(note || '').replace(/^#\s*/, '').trim()
  if (!cleanedNote) return base
  return `${base}${base ? ' ' : ''}#${cleanedNote}`
}

export function stripReturnAnnotation(description: string) {
  return String(description || '').replace(/\s*\(Return:[^()]*(?:\([^)]*\)[^()]*)?\)\s*$/i, '').trim()
}

function extractTrailingParenthetical(value: string) {
  const text = value.trim()
  if (!text.endsWith(')')) return null
  let depth = 0
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index]
    if (char === ')') depth += 1
    else if (char === '(') {
      depth -= 1
      if (depth === 0) {
        const before = text.slice(0, index).trimEnd()
        if (before && !/\s$/.test(text[index - 1] || '')) return null
        return { before, content: text.slice(index + 1, -1).trim() }
      }
    }
  }
  return null
}

export function parseGiftcardDescription(description: string): GiftcardDescriptionParts | null {
  let base = splitDescriptionNote(description).base.trim()
  let source = ''
  let face = ''
  const sourceMatch = extractTrailingParenthetical(base)
  if (sourceMatch) {
    source = sourceMatch.content
    base = sourceMatch.before
  }
  const faceMatch = base.match(/\s+\$([0-9][\d,]*(?:\.\d{1,2})?)\s*$/)
  if (faceMatch) {
    face = faceMatch[1].replace(/,/g, '')
    base = base.slice(0, faceMatch.index).trim()
  }
  const vendor = stripReturnAnnotation(base).trim()
  if (!vendor || !classifyPaymentMethod(vendor).includes('giftcard')) return null
  return { vendor, face, source }
}

export function composeGiftcardDescription(parts: GiftcardDescriptionParts, note = '') {
  const vendor = parts.vendor.trim()
  const face = parts.face.trim()
  const source = parts.source.trim()
  let description = vendor
  if (face) description += ` $${formatPlainAmount(face)}`
  if (source) description += ` (${source})`
  return appendNoteToDescription(description, note)
}

function formatPlainAmount(value: string) {
  const number = parseCurrency(value)
  if (!number) return value.replace(/[$,]/g, '')
  return Number.isInteger(number) ? String(number) : String(number)
}
