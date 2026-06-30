import type { Expense } from './types'
import { categoryName } from './format'
import { parseCurrency } from './giftcards'
import { parseTags } from './tags'

export type CardBenefitPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export type CardBenefit = {
  rowIndex: number
  card: string
  benefit: string
  amount: number
  period: CardBenefitPeriod
  category: string
  matcher: string
  startDate: string
  endDate: string
  active: boolean
}

export type BenefitUsage = {
  benefit: CardBenefit
  start: string
  end: string
  eligibleSpend: number
  used: number
  remaining: number
  count: number
}

const periods = new Set<CardBenefitPeriod>(['monthly', 'quarterly', 'semiannual', 'annual'])

function parseDate(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10)
}

function parsePeriod(value: unknown): CardBenefitPeriod {
  const text = String(value ?? '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')
  if (text === 'month' || text === 'monthly') return 'monthly'
  if (text === 'quarter' || text === 'quarterly') return 'quarterly'
  if (text === 'halfyear' || text === 'halfyearly' || text === 'semiannual' || text === 'semiannually') return 'semiannual'
  if (text === 'year' || text === 'annual' || text === 'annually' || text === 'yearly') return 'annual'
  return periods.has(text as CardBenefitPeriod) ? text as CardBenefitPeriod : 'monthly'
}

function parseBoolean(value: unknown, fallback: boolean) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(true|yes|y|active|1)$/i.test(text)) return true
  if (/^(false|no|n|inactive|0)$/i.test(text)) return false
  return fallback
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0))
}

function maxIso(a: string, b: string) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function minIso(a: string, b: string) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function cardProductKey(name: string) {
  return cardProductName(name).toLocaleLowerCase()
}

export function cardProductName(name: string) {
  return String(name || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[-–—]?\s*\d{4,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type BenefitCard = { name: string; product?: string; subStart?: string }

export function expandCardBenefitsForCards(benefits: CardBenefit[], cards: BenefitCard[]): CardBenefit[] {
  return benefits.flatMap((benefit) => {
    const benefitProduct = cardProductKey(benefit.card)
    return cards
      .filter((card) => cardProductKey(card.product || card.name) === benefitProduct)
      .map((card) => ({ ...benefit, card: card.name, startDate: benefit.startDate || card.subStart || '' }))
  })
}

export function parseCardBenefitRows(rows: string[][] = []): CardBenefit[] {
  return rows
    .map((row, index) => {
      const [card = '', benefit = '', amount = '', period = '', category = '', matcher = '', startDate = '', endDate = '', active = ''] = row
      return {
        rowIndex: index + 2,
        card: String(card || '').trim(),
        benefit: String(benefit || '').trim(),
        amount: parseCurrency(amount),
        period: parsePeriod(period),
        category: String(category || '').trim(),
        matcher: String(matcher || '').trim(),
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
        active: parseBoolean(active, true),
      }
    })
    .filter((benefit) => benefit.card || benefit.benefit || benefit.amount)
}

export function benefitWindow(benefit: CardBenefit, todayIso = iso(new Date())) {
  const today = new Date(`${todayIso}T00:00:00.000Z`)
  if (Number.isNaN(today.getTime())) return null
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  let startMonth = 0
  let endMonth = 11
  if (benefit.period === 'monthly') {
    startMonth = month
    endMonth = month
  } else if (benefit.period === 'quarterly') {
    startMonth = Math.floor(month / 3) * 3
    endMonth = startMonth + 2
  } else if (benefit.period === 'semiannual') {
    startMonth = month < 6 ? 0 : 6
    endMonth = startMonth + 5
  }
  const rawStart = iso(new Date(Date.UTC(year, startMonth, 1)))
  const rawEnd = iso(monthEnd(year, endMonth))
  const start = maxIso(rawStart, benefit.startDate)
  const end = minIso(rawEnd, benefit.endDate)
  if (start && end && start > end) return null
  if (todayIso < start || todayIso > end) return null
  return { start, end }
}

function includesMatcher(expense: Expense, matcher: string) {
  const tokens = matcher.split(',').map((part) => part.trim().toLocaleLowerCase()).filter(Boolean)
  if (!tokens.length) return true
  const text = `${expense.description} ${parseTags(expense.tags).join(' ')}`.toLocaleLowerCase()
  return tokens.some((token) => text.includes(token))
}

function matchesBenefit(expense: Expense, benefit: CardBenefit, start: string, end: string) {
  if (expense.date < start || expense.date > end) return false
  if (expense.paymentMethod.trim().toLocaleLowerCase() !== benefit.card.trim().toLocaleLowerCase()) return false
  if (benefit.category && categoryName(expense.category).toLocaleLowerCase() !== categoryName(benefit.category).toLocaleLowerCase()) return false
  return includesMatcher(expense, benefit.matcher)
}

export function calculateBenefitUsage(benefit: CardBenefit, expenses: Expense[], todayIso = iso(new Date())): BenefitUsage | null {
  if (!benefit.active || benefit.amount <= 0) return null
  const window = benefitWindow(benefit, todayIso)
  if (!window) return null
  const matches = expenses.filter((expense) => matchesBenefit(expense, benefit, window.start, window.end))
  const eligibleSpend = Math.max(0, money(matches.reduce((sum, expense) => sum + expense.amount, 0)))
  const used = Math.min(benefit.amount, eligibleSpend)
  return {
    benefit,
    ...window,
    eligibleSpend,
    used: money(used),
    remaining: money(Math.max(0, benefit.amount - used)),
    count: matches.length,
  }
}

export function calculateBenefitUsageByCard(benefits: CardBenefit[], expenses: Expense[], todayIso = iso(new Date())) {
  const map = new Map<string, BenefitUsage[]>()
  for (const benefit of benefits) {
    const usage = calculateBenefitUsage(benefit, expenses, todayIso)
    if (!usage) continue
    const key = benefit.card.trim().toLocaleLowerCase()
    map.set(key, [...(map.get(key) || []), usage])
  }
  for (const [key, usages] of map) {
    map.set(key, usages.sort((a, b) => a.remaining - b.remaining || a.benefit.benefit.localeCompare(b.benefit.benefit)))
  }
  return map
}
