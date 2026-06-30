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

test('matches split-payment returns by payment method', () => {
  const cardPart = expense({ rowIndex: 30, amount: 70, description: 'IKEA desk', date: '2026-06-25', paymentMethod: 'Amex Platinum' })
  const giftcardPart = expense({ rowIndex: 31, amount: 30, description: 'IKEA desk', date: '2026-06-25', paymentMethod: 'IKEA GC' })
  const cardReturn = expense({ rowIndex: 32, amount: -20, description: 'Return: IKEA desk (2026-06-25)', date: '2026-06-26', paymentMethod: 'Amex Platinum' })
  const giftcardReturn = expense({ rowIndex: 33, amount: -5, description: 'Return: IKEA desk (2026-06-25)', date: '2026-06-26', paymentMethod: 'IKEA GC' })
  const rows = [cardPart, giftcardPart, cardReturn, giftcardReturn]

  assert.equal(findOriginalExpenseForReturn(cardReturn, rows), cardPart)
  assert.equal(findOriginalExpenseForReturn(giftcardReturn, rows), giftcardPart)
  assert.deepEqual(getReturnSummary(cardPart, rows), {
    returned: 20,
    remaining: 50,
    count: 1,
  })
  assert.deepEqual(getReturnSummary(giftcardPart, rows), {
    returned: 5,
    remaining: 25,
    count: 1,
  })
})
