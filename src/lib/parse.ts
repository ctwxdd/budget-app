import type { Expense } from './types'
import { formatTags } from './tags'
import { parseSheetDate, todayIso } from './dates'

function parseDateCell(value: string, rowIndex?: number): string {
  const raw = String(value || '').trim()
  const fallback = todayIso()
  if (!raw) {
    if (import.meta.env.DEV) console.warn(`Expense row ${rowIndex ?? '?'} has an empty date; defaulting to today.`)
    return fallback
  }
  const parsed = parseSheetDate(raw)
  if (!parsed) {
    if (import.meta.env.DEV) console.warn(`Expense row ${rowIndex ?? '?'} date could not be parsed: "${raw}"; defaulting to today.`)
    return fallback
  }
  return parsed
}

export function parseExpenseRows(values: string[][] = []): Expense[] {
  return values
    .map((row, index) => {
      const [date = '', amount = '', description = '', category = '', paymentMethod = '', reimbursement = '', _reserved = '', tags = ''] = row
      return {
        rowIndex: index + 2,
        date: parseDateCell(date, index + 2),
        amount: Number.parseFloat(String(amount).replace(/[$,]/g, '')) || 0,
        description: String(description || ''),
        category: String(category || ''),
        paymentMethod: String(paymentMethod || ''),
        reimbursement: String(reimbursement || ''),
        tags: formatTags(String(tags || '')),
      }
    })
    .filter((expense) => expense.date || expense.amount || expense.description)
}

export function expenseToRow(expense: Expense | Omit<Expense, 'rowIndex'>): (string | number)[] {
  return [expense.date, expense.amount, expense.description, expense.category, expense.paymentMethod, expense.reimbursement]
}

export function expenseTagsCell(expense: Expense | Omit<Expense, 'rowIndex'>): string {
  return formatTags(expense.tags)
}
