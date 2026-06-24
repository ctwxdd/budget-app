const test = require('node:test')
const assert = require('node:assert/strict')

const {
  NO_PAYMENT_FILTER,
  applyExpenseFilters,
  defaultFilters,
  displayFilterValue,
} = require('../../.tmp-test/src/lib/expenseFilters.js')

const expense = (overrides) => ({
  rowIndex: 1,
  date: '2026-06-10',
  amount: 10,
  description: 'Coffee',
  category: 'Food',
  paymentMethod: 'Visa',
  reimbursement: '',
  tags: '',
  ...overrides,
})

const ids = (rows) => rows.map((row) => row.rowIndex)

test('filters uncategorized expenses using the display category name', () => {
  const rows = [
    expense({ rowIndex: 1, category: '' }),
    expense({ rowIndex: 2, category: 'Food' }),
  ]

  const result = applyExpenseFilters(rows, { ...defaultFilters, categories: ['Uncategorized'] })

  assert.deepEqual(ids(result), [1])
})

test('filters expenses with no payment method explicitly', () => {
  const rows = [
    expense({ rowIndex: 1, paymentMethod: '' }),
    expense({ rowIndex: 2, paymentMethod: 'Amex' }),
  ]

  const result = applyExpenseFilters(rows, { ...defaultFilters, payments: [NO_PAYMENT_FILTER] })

  assert.deepEqual(ids(result), [1])
  assert.equal(displayFilterValue(NO_PAYMENT_FILTER), 'No payment method')
})

test('matches tags case-insensitively and keeps untagged rows out', () => {
  const rows = [
    expense({ rowIndex: 1, tags: 'Travel, Taiwan' }),
    expense({ rowIndex: 2, tags: 'Home' }),
    expense({ rowIndex: 3, tags: '' }),
  ]

  const result = applyExpenseFilters(rows, { ...defaultFilters, tags: ['travel'] })

  assert.deepEqual(ids(result), [1])
})

test('combines date range, search, and reimbursement filters', () => {
  const rows = [
    expense({ rowIndex: 1, date: '2026-06-09', description: 'T&T Supermarket', reimbursement: 'Pending' }),
    expense({ rowIndex: 2, date: '2026-06-11', description: 'T&T Supermarket', reimbursement: 'Reimbursed' }),
    expense({ rowIndex: 3, date: '2026-06-12', description: 'IKEA', reimbursement: 'Pending' }),
  ]

  const result = applyExpenseFilters(rows, {
    ...defaultFilters,
    preset: 'custom',
    start: '2026-06-10',
    end: '2026-06-30',
    reimbursement: 'Reimbursed',
    search: 'supermarket',
  })

  assert.deepEqual(ids(result), [2])
})
