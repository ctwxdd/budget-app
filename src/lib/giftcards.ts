export type PaymentMethodType = 'giftcard' | 'cash' | 'card'

export type GiftcardDescriptionParts = {
  vendor: string
  face: string
  source: string
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

export function parseGiftcardDescription(description: string): GiftcardDescriptionParts | null {
  let base = stripReturnAnnotation(splitDescriptionNote(description).base)
  let source = ''
  let face = ''
  const sourceMatch = base.match(/\s+\(([^)]+)\)\s*$/)
  if (sourceMatch) {
    source = sourceMatch[1].trim()
    base = base.slice(0, sourceMatch.index).trim()
  }
  const faceMatch = base.match(/\s+\$([0-9][\d,]*(?:\.\d{1,2})?)\s*$/)
  if (faceMatch) {
    face = faceMatch[1].replace(/,/g, '')
    base = base.slice(0, faceMatch.index).trim()
  }
  const vendor = base.trim()
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
