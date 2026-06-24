import type { DatePreset, Expense } from './types'
import { categoryName, filterByDateRange, getPresetRange } from './format'
import { hasAnyTag } from './tags'

export type ExpenseFilters = {
  preset: DatePreset
  start: string
  end: string
  categories: string[]
  payments: string[]
  tags: string[]
  reimbursement: string
  search: string
}

export const NO_PAYMENT_FILTER = '__NO_PAYMENT__'
export const NO_PAYMENT_LABEL = 'No payment method'

export const defaultFilters: ExpenseFilters = {
  preset: 'all',
  start: '',
  end: '',
  categories: [],
  payments: [],
  tags: [],
  reimbursement: 'All',
  search: '',
}

export function displayFilterValue(value: string, noPaymentLabel = NO_PAYMENT_LABEL) {
  return value === NO_PAYMENT_FILTER ? noPaymentLabel : value
}

export function applyExpenseFilters(expenses: Expense[], filters: ExpenseFilters) {
  const range = getPresetRange(filters.preset, filters.start, filters.end)
  return filterByDateRange(expenses, range.start, range.end).filter((expense) => {
    if (filters.categories.length && !filters.categories.includes(categoryName(expense.category))) return false
    if (filters.payments.length && !filters.payments.some((payment) => payment === NO_PAYMENT_FILTER ? !expense.paymentMethod.trim() : payment === expense.paymentMethod)) return false
    if (!hasAnyTag(expense.tags, filters.tags)) return false
    if (filters.reimbursement === 'Reimbursed' && expense.reimbursement !== 'Reimbursed') return false
    if (filters.reimbursement === 'Pending' && expense.reimbursement !== 'Pending') return false
    if (filters.reimbursement === 'None' && expense.reimbursement) return false
    if (filters.search && !expense.description.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })
}
