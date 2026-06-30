import type { Expense } from './types'
import { splitDescriptionNote } from './giftcards'

export type ReturnTarget = {
  description: string
  date: string
}

export type ReturnSummary = {
  returned: number
  remaining: number
  count: number
}

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function normalizedDescription(value: string) {
  return splitDescriptionNote(value).base.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function targetKey(target: ReturnTarget) {
  return `${target.date}\n${normalizedDescription(target.description)}`
}

export function parseReturnTarget(description: string): ReturnTarget | null {
  const base = splitDescriptionNote(description).base.trim()
  const match = base.match(/^Return:\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/i)
  if (!match) return null
  return { description: match[1].trim(), date: match[2] }
}

export function findOriginalExpenseForReturn(returnExpense: Expense, expenses: Expense[]) {
  const target = parseReturnTarget(returnExpense.description)
  if (!target) return null
  const key = targetKey(target)
  return expenses.find((expense) => expense.amount > 0 && targetKey({ description: expense.description, date: expense.date }) === key) || null
}

export function getReturnSummary(original: Expense, expenses: Expense[], ignoredReturnRowIndex?: number): ReturnSummary {
  if (original.amount <= 0) return { returned: 0, remaining: 0, count: 0 }
  const key = targetKey({ description: original.description, date: original.date })
  let returned = 0
  let count = 0
  for (const expense of expenses) {
    if (expense.amount >= 0 || expense.rowIndex === ignoredReturnRowIndex) continue
    const target = parseReturnTarget(expense.description)
    if (!target || targetKey(target) !== key) continue
    returned += Math.abs(expense.amount)
    count += 1
  }
  return { returned: money(returned), remaining: Math.max(0, money(original.amount - returned)), count }
}
