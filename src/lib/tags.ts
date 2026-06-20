import type { Expense } from './types'

export function parseTags(value = '') {
  const seen = new Set<string>()
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function formatTags(value = '') {
  return parseTags(value).join(', ')
}

export function hasAnyTag(value: string, selected: string[]) {
  if (!selected.length) return true
  const tags = parseTags(value).map((tag) => tag.toLocaleLowerCase())
  return selected.some((tag) => tags.includes(tag.toLocaleLowerCase()))
}

export function groupTagTotals(expenses: Expense[]) {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    for (const tag of parseTags(expense.tags)) {
      totals.set(tag, (totals.get(tag) || 0) + expense.amount)
    }
  }
  return Array.from(totals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
}
