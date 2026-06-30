const test = require('node:test')
const assert = require('node:assert/strict')

const {
  findOriginalExpenseForReturn,
  getReturnSummary,
  parseReturnTarget,
} = require('../../.tmp-test/src/lib/returns.js')

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

test('parses app-created return descriptions', () => {
  assert.deepEqual(parseReturnTarget('Return: IKEA shelf (2026-06-10)'), {
    description: 'IKEA shelf',
    date: '2026-06-10',
  })
  assert.equal(parseReturnTarget('IKEA shelf (2026-06-10)'), null)
})

test('calculates returned and remaining amount for an original expense', () => {
  const original = expense({ rowIndex: 10, amount: 100, description: 'IKEA shelf', date: '2026-06-10' })
  const rows = [
    original,
    expense({ rowIndex: 11, amount: -25.5, description: 'Return: IKEA shelf (2026-06-10)', date: '2026-06-12' }),
    expense({ rowIndex: 12, amount: -10, description: 'Return: IKEA shelf (2026-06-10) # damaged corner', date: '2026-06-13' }),
    expense({ rowIndex: 13, amount: -8, description: 'Return: Other item (2026-06-10)', date: '2026-06-13' }),
  ]

  assert.deepEqual(getReturnSummary(original, rows), {
    returned: 35.5,
    remaining: 64.5,
    count: 2,
  })
})

test('finds original purchase and excludes the return being edited', () => {
  const original = expense({ rowIndex: 20, amount: 80, description: 'H&M shirt', date: '2026-06-19' })
  const editingReturn = expense({ rowIndex: 21, amount: -30, description: 'Return: H&M shirt (2026-06-19)', date: '2026-06-20' })
  const otherReturn = expense({ rowIndex: 22, amount: -15, description: 'Return: H&M shirt (2026-06-19)', date: '2026-06-21' })
  const rows = [original, editingReturn, otherReturn]

  assert.equal(findOriginalExpenseForReturn(editingReturn, rows), original)
  assert.deepEqual(getReturnSummary(original, rows, editingReturn.rowIndex), {
    returned: 15,
    remaining: 65,
    count: 1,
  })
})
