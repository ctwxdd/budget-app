import type { Expense } from './types'
import { categoryName } from './format'
import { dateToIsoDate, localDateFromIso, normalizeDateCell, todayIso } from './dates'
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
  creditAmount?: number
  pendingCreditAmount?: number
  creditCount?: number
  creditRows?: CardBenefitCredit[]
}

export type BenefitCreditStatus = 'pending' | 'received'

export type CardBenefitCredit = {
  rowIndex: number
  date: string
  card: string
  benefit: string
  amount: number
  status: BenefitCreditStatus
  note: string
}

const periods = new Set<CardBenefitPeriod>(['monthly', 'quarterly', 'semiannual', 'annual'])

const monthNameMap: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

function lastDayOfMonth(month: string) {
  return String(new Date(2024, Number(month), 0).getDate()).padStart(2, '0')
}

function isRecurringMonthDay(value: string) {
  return /^\d{2}-\d{2}$/.test(value)
}

function parseBenefitDate(value: unknown, boundary: 'start' | 'end'): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return dateToIsoDate(value)
  const text = String(value).trim()
  if (!text) return ''
  if (isRecurringMonthDay(text)) return text
  const month = monthNameMap[text.toLocaleLowerCase()]
  if (month) return `${month}-${boundary === 'start' ? '01' : lastDayOfMonth(month)}`
  return normalizeDateCell(value)
}

function parseDate(value: unknown): string {
  return normalizeDateCell(value)
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

function parseCreditStatus(value: unknown): BenefitCreditStatus {
  return /^pending$/i.test(String(value ?? '').trim()) ? 'pending' : 'received'
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

function resolveBenefitDate(value: string, year: number) {
  if (isRecurringMonthDay(value)) return `${year}-${value}`
  return value
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

function expandedBenefitStartDate(benefit: CardBenefit, card: BenefitCard) {
  if (!benefit.startDate) return card.subStart || ''
  if (benefit.endDate) return benefit.startDate
  return isRecurringMonthDay(benefit.startDate) ? benefit.startDate : card.subStart || benefit.startDate
}

export function expandCardBenefitsForCards(benefits: CardBenefit[], cards: BenefitCard[]): CardBenefit[] {
  return benefits.flatMap((benefit) => {
    const benefitProduct = cardProductKey(benefit.card)
    return cards
      .filter((card) => cardProductKey(card.product || card.name) === benefitProduct)
      .map((card) => ({ ...benefit, card: card.name, startDate: expandedBenefitStartDate(benefit, card) }))
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
        startDate: parseBenefitDate(startDate, 'start'),
        endDate: parseBenefitDate(endDate, 'end'),
        active: parseBoolean(active, true),
      }
    })
    .filter((benefit) => benefit.card || benefit.benefit || benefit.amount)
}

export function parseBenefitCreditRows(rows: string[][] = []): CardBenefitCredit[] {
  return rows
    .map((row, index) => {
      const [date = '', card = '', benefit = '', amount = '', status = '', note = ''] = row
      return {
        rowIndex: index + 2,
        date: parseDate(date),
        card: String(card || '').trim(),
        benefit: String(benefit || '').trim(),
        amount: parseCurrency(amount),
        status: parseCreditStatus(status),
        note: String(note || '').trim(),
      }
    })
    .filter((credit) => credit.date || credit.card || credit.benefit || credit.amount)
}

export function benefitWindow(benefit: CardBenefit, currentIso = todayIso()) {
  const today = localDateFromIso(currentIso)
  if (!today) return null
  const year = today.getFullYear()
  const month = today.getMonth()
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
  const rawStart = dateToIsoDate(new Date(year, startMonth, 1))
  const rawEnd = dateToIsoDate(new Date(year, endMonth + 1, 0))
  const start = maxIso(rawStart, resolveBenefitDate(benefit.startDate, year))
  const end = minIso(rawEnd, resolveBenefitDate(benefit.endDate, year))
  if (start && end && start > end) return null
  if (currentIso < start || currentIso > end) return null
  return { start, end }
}

function includesMatcher(expense: Expense, matcher: string) {
  const tokens = matcher.split(',').map((part) => part.trim().toLocaleLowerCase()).filter(Boolean)
  if (!tokens.length) return true
  const text = `${expense.description} ${parseTags(expense.tags).join(' ')}`.toLocaleLowerCase()
  return tokens.some((token) => text.includes(token))
}

export function cardBenefitWalletMatcher(benefit: CardBenefit) {
  const matcher = benefit.matcher.trim()
  if (!/^wallet\s*:/i.test(matcher)) return ''
  return matcher.replace(/^wallet\s*:/i, '').trim()
}

function includesWalletMatcher(expense: Expense, matcher: string) {
  const tokens = matcher.split(',').map((part) => part.trim().toLocaleLowerCase()).filter(Boolean)
  if (!tokens.length) return true
  const text = [
    expense.description,
    expense.paymentMethod,
    categoryName(expense.category),
    parseTags(expense.tags).join(' '),
  ].join(' ').toLocaleLowerCase()
  return tokens.some((token) => text.includes(token))
}

function matchesBenefit(expense: Expense, benefit: CardBenefit, start: string, end: string) {
  if (expense.date < start || expense.date > end) return false
  if (benefit.category && categoryName(expense.category).toLocaleLowerCase() !== categoryName(benefit.category).toLocaleLowerCase()) return false
  const wallet = cardBenefitWalletMatcher(benefit)
  if (wallet) return includesWalletMatcher(expense, wallet)
  if (expense.paymentMethod.trim().toLocaleLowerCase() !== benefit.card.trim().toLocaleLowerCase()) return false
  return includesMatcher(expense, benefit.matcher)
}

export function calculateBenefitUsage(benefit: CardBenefit, expenses: Expense[], currentIso = todayIso()): BenefitUsage | null {
  if (!benefit.active || benefit.amount <= 0) return null
  const window = benefitWindow(benefit, currentIso)
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

function walletGroupKey(benefit: CardBenefit) {
  return [
    benefit.benefit.trim().toLocaleLowerCase(),
    benefit.period,
    categoryName(benefit.category).toLocaleLowerCase(),
    cardBenefitWalletMatcher(benefit).toLocaleLowerCase(),
  ].join('||')
}

export function calculateBenefitUsages(benefits: CardBenefit[], expenses: Expense[], currentIso = todayIso()): BenefitUsage[] {
  const usages: BenefitUsage[] = []
  const walletGroups = new Map<string, Array<{ benefit: CardBenefit; start: string; end: string }>>()
  for (const benefit of benefits) {
    if (!benefit.active || benefit.amount <= 0) continue
    if (!cardBenefitWalletMatcher(benefit)) {
      const usage = calculateBenefitUsage(benefit, expenses, currentIso)
      if (usage) usages.push(usage)
      continue
    }
    const window = benefitWindow(benefit, currentIso)
    if (!window) continue
    const key = walletGroupKey(benefit)
    walletGroups.set(key, [...(walletGroups.get(key) || []), { benefit, ...window }])
  }

  for (const group of walletGroups.values()) {
    const remainingSpend = new Map<number, number>()
    expenses.forEach((expense, index) => {
      remainingSpend.set(index, Math.max(0, expense.amount))
    })
    const ordered = [...group].sort((a, b) =>
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.benefit.card.localeCompare(b.benefit.card))
    for (const item of ordered) {
      const matches = expenses
        .map((expense, index) => ({ expense, index }))
        .filter(({ expense }) => matchesBenefit(expense, item.benefit, item.start, item.end))
        .sort((a, b) => a.expense.date.localeCompare(b.expense.date) || a.index - b.index)
      const eligibleSpend = money(matches.reduce((sum, { index }) => sum + (remainingSpend.get(index) || 0), 0))
      const used = money(Math.min(item.benefit.amount, eligibleSpend))
      let remainingUsed = used
      for (const { index } of matches) {
        if (remainingUsed <= 0) break
        const remaining = remainingSpend.get(index) || 0
        const consumed = Math.min(remaining, remainingUsed)
        remainingSpend.set(index, money(remaining - consumed))
        remainingUsed = money(remainingUsed - consumed)
      }
      usages.push({
        benefit: item.benefit,
        start: item.start,
        end: item.end,
        eligibleSpend,
        used,
        remaining: money(Math.max(0, item.benefit.amount - used)),
        count: matches.filter(({ index }) => (remainingSpend.get(index) || 0) > 0 || used > 0).length,
      })
    }
  }
  return usages
}

function sameText(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

export function applyBenefitCredits(usage: BenefitUsage, credits: CardBenefitCredit[]): BenefitUsage {
  const rows = credits.filter((credit) =>
    sameText(credit.card, usage.benefit.card) &&
    sameText(credit.benefit, usage.benefit.benefit) &&
    credit.date >= usage.start &&
    credit.date <= usage.end)
  if (!rows.length) return usage
  const creditAmount = money(rows.filter((credit) => credit.status === 'received').reduce((sum, credit) => sum + credit.amount, 0))
  const pendingCreditAmount = money(rows.filter((credit) => credit.status === 'pending').reduce((sum, credit) => sum + credit.amount, 0))
  const used = creditAmount > 0 ? Math.min(usage.benefit.amount, creditAmount) : usage.used
  return {
    ...usage,
    used,
    remaining: money(Math.max(0, usage.benefit.amount - used)),
    creditAmount,
    pendingCreditAmount,
    creditCount: rows.length,
    creditRows: rows,
  }
}

export function calculateBenefitUsageByCard(benefits: CardBenefit[], expenses: Expense[], currentIso = todayIso()) {
  const map = new Map<string, BenefitUsage[]>()
  for (const usage of calculateBenefitUsages(benefits, expenses, currentIso)) {
    const benefit = usage.benefit
    const key = benefit.card.trim().toLocaleLowerCase()
    map.set(key, [...(map.get(key) || []), usage])
  }
  for (const [key, usages] of map) {
    map.set(key, usages.sort((a, b) => a.remaining - b.remaining || a.benefit.benefit.localeCompare(b.benefit.benefit)))
  }
  return map
}
