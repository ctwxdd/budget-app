import { normalizeDateCell } from './dates'

export type PaymentMethodType = 'giftcard' | 'cash' | 'card'

export type GiftcardDescriptionParts = {
  vendor: string
  face: string
  source: string
}

export type GiftcardIdentity = { card: string; vendor: string; date: string }

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
  return `${card.vendor} (${normalizeDateCell(card.date)})`
}

export function cardForGiftcardMethod(method: string, cards: readonly GiftcardIdentity[]) {
  const matches = cards.filter((card) => sameGiftcardName(method, giftcardMethodForCard(card)) || matchesGiftcardMethod(method, card) || sameGiftcardName(method, card.card))
  return matches.length === 1 ? matches[0] : undefined
}

export function resolveGiftcardMethod(method: string, cards: readonly GiftcardIdentity[]) {
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
