const test = require('node:test')
const assert = require('node:assert/strict')

const {
  benefitWindow,
  applyBenefitCredits,
  calculateBenefitUsage,
  calculateBenefitUsages,
  calculateBenefitUsageByCard,
  cardProductKey,
  expandCardBenefitsForCards,
  parseBenefitCreditRows,
  parseCardBenefitRows,
} = require('../../.tmp-test/src/lib/cardBenefits.js')

const expense = (overrides) => ({
  rowIndex: 1,
  date: '2026-06-10',
  amount: 10,
  description: 'Dinner',
  category: '外食',
  paymentMethod: 'Amex Brilliant',
  reimbursement: '',
  tags: '',
  ...overrides,
})

test('parses card benefit rows and aliases periods', () => {
  const rows = [['Amex Platinum', 'Hotel Credit', '$300', 'half yearly', 'Travel', 'hotel', '2026-01-01', '', 'TRUE']]

  const [benefit] = parseCardBenefitRows(rows)

  assert.equal(benefit.card, 'Amex Platinum')
  assert.equal(benefit.amount, 300)
  assert.equal(benefit.period, 'semiannual')
  assert.equal(benefit.active, true)
})

test('parses month-only benefit dates as recurring month-day ranges', () => {
  const rows = [['Amex Platinum', 'Uber December Credit', '$35', 'annual', '', 'wallet:Uber', 'Dec', 'December', 'TRUE']]

  const [benefit] = parseCardBenefitRows(rows)

  assert.equal(benefit.startDate, '12-01')
  assert.equal(benefit.endDate, '12-31')
})

test('uses recurring month-day benefit windows in the current year', () => {
  const [benefit] = parseCardBenefitRows([['Amex Platinum', 'Uber December Credit', '35', 'annual', '', 'wallet:Uber', '12-01', '12-31', 'TRUE']])

  assert.equal(benefitWindow(benefit, '2026-11-30'), null)
  assert.deepEqual(benefitWindow(benefit, '2026-12-15'), { start: '2026-12-01', end: '2026-12-31' })
  assert.deepEqual(benefitWindow(benefit, '2027-12-15'), { start: '2027-12-01', end: '2027-12-31' })
})

test('calculates monthly credit usage by card and category', () => {
  const [benefit] = parseCardBenefitRows([['Amex Brilliant', 'Dining Credit', '25', 'monthly', '外食', '', '2026-01-01', '', 'TRUE']])
  const rows = [
    expense({ rowIndex: 1, amount: 18, date: '2026-06-05' }),
    expense({ rowIndex: 2, amount: 12, date: '2026-06-20' }),
    expense({ rowIndex: 3, amount: 9, date: '2026-05-31' }),
    expense({ rowIndex: 4, amount: 6, category: 'Travel' }),
  ]

  const usage = calculateBenefitUsage(benefit, rows, '2026-06-30')

  assert.equal(usage.used, 25)
  assert.equal(usage.remaining, 0)
  assert.equal(usage.eligibleSpend, 30)
  assert.equal(usage.count, 2)
})

test('uses calendar quarters and merchant or tag matching', () => {
  const [benefit] = parseCardBenefitRows([['Amex Platinum', 'Resy Credit', '100', 'quarterly', '外食', 'resy', '2026-01-01', '', 'TRUE']])
  const rows = [
    expense({ rowIndex: 1, paymentMethod: 'Amex Platinum', date: '2026-04-10', amount: 40, description: 'Cafe Resy' }),
    expense({ rowIndex: 2, paymentMethod: 'Amex Platinum', date: '2026-06-10', amount: 35, description: 'Dinner', tags: 'Resy' }),
    expense({ rowIndex: 3, paymentMethod: 'Amex Platinum', date: '2026-03-31', amount: 80, description: 'Resy old quarter' }),
    expense({ rowIndex: 4, paymentMethod: 'Amex Platinum', date: '2026-05-01', amount: 20, description: 'Dinner no match' }),
  ]

  const usage = calculateBenefitUsage(benefit, rows, '2026-06-30')

  assert.equal(usage.start, '2026-04-01')
  assert.equal(usage.end, '2026-06-30')
  assert.equal(usage.used, 75)
  assert.equal(usage.remaining, 25)
  assert.equal(usage.count, 2)
})

test('wallet benefits match merchant spend without requiring the source card payment method', () => {
  const [benefit] = parseCardBenefitRows([['Amex Platinum', 'Uber Credit', '15', 'monthly', '', 'wallet:Uber', '2026-01-01', '', 'TRUE']])
  const rows = [
    expense({ rowIndex: 1, paymentMethod: 'Apple Pay', date: '2026-06-05', amount: 8, description: 'Uber Eats' }),
    expense({ rowIndex: 2, paymentMethod: 'Amex Gold', date: '2026-06-20', amount: 20, description: 'Uber ride' }),
    expense({ rowIndex: 3, paymentMethod: 'Amex Platinum', date: '2026-06-25', amount: 30, description: 'Lyft ride' }),
  ]

  const usage = calculateBenefitUsage(benefit, rows, '2026-06-30')

  assert.equal(usage.used, 15)
  assert.equal(usage.remaining, 0)
  assert.equal(usage.eligibleSpend, 28)
  assert.equal(usage.count, 2)
})

test('wallet benefits share one spend pool across multiple products and cards', () => {
  const benefits = parseCardBenefitRows([
    ['Amex Gold', 'Uber Credit', '10', 'monthly', '', 'wallet:Uber', '2026-01-01', '', 'TRUE'],
    ['Amex Platinum', 'Uber Credit', '15', 'monthly', '', 'wallet:Uber', '2026-01-01', '', 'TRUE'],
    ['Amex Business Gold', 'Uber Credit', '10', 'monthly', '', 'wallet:Uber', '2026-01-01', '', 'TRUE'],
  ]).map((benefit, index) => ({ ...benefit, card: `${benefit.card} ${index + 1}` }))
  const rows = [
    expense({ rowIndex: 1, paymentMethod: 'Apple Pay', date: '2026-06-05', amount: 8, description: 'Uber Eats' }),
    expense({ rowIndex: 2, paymentMethod: 'Amex Gold', date: '2026-06-20', amount: 12, description: 'Uber ride' }),
  ]

  const usages = calculateBenefitUsages(benefits, rows, '2026-06-30')

  assert.equal(usages.reduce((sum, usage) => sum + usage.used, 0), 20)
  assert.deepEqual(usages.map((usage) => usage.used), [10, 10, 0])
  assert.equal(usages.reduce((sum, usage) => sum + usage.remaining, 0), 15)
})

test('regular benefits still require matching payment method', () => {
  const [benefit] = parseCardBenefitRows([['Amex Platinum', 'Uber Credit', '15', 'monthly', '', 'Uber', '2026-01-01', '', 'TRUE']])
  const rows = [
    expense({ rowIndex: 1, paymentMethod: 'Apple Pay', date: '2026-06-05', amount: 8, description: 'Uber Eats' }),
    expense({ rowIndex: 2, paymentMethod: 'Amex Platinum', date: '2026-06-20', amount: 9, description: 'Uber ride' }),
  ]

  const usage = calculateBenefitUsage(benefit, rows, '2026-06-30')

  assert.equal(usage.used, 9)
  assert.equal(usage.eligibleSpend, 9)
  assert.equal(usage.count, 1)
})

test('uses calendar half years for semiannual credits', () => {
  const [benefit] = parseCardBenefitRows([['Amex Platinum', 'Hotel Credit', '300', 'semiannual', 'Travel', 'hotel', '2026-01-01', '', 'TRUE']])

  assert.deepEqual(benefitWindow(benefit, '2026-02-15'), { start: '2026-01-01', end: '2026-06-30' })
  assert.deepEqual(benefitWindow(benefit, '2026-07-01'), { start: '2026-07-01', end: '2026-12-31' })
})

test('manual received benefit credits override expense matching', () => {
  const [benefit] = parseCardBenefitRows([['Amex Aspire', 'Hilton Hotel Credit', '200', 'semiannual', 'Travel', 'hilton', '2026-01-01', '', 'TRUE']])
  const usage = calculateBenefitUsage(benefit, [
    expense({ paymentMethod: 'Amex Aspire', category: 'Travel', description: 'Hilton stay', amount: 50 }),
  ], '2026-06-30')
  const credits = parseBenefitCreditRows([
    ['2026-06-20', 'Amex Aspire', 'Hilton Hotel Credit', '$200', 'Received', 'Statement credit posted'],
  ])

  const adjusted = applyBenefitCredits(usage, credits)

  assert.equal(adjusted.used, 200)
  assert.equal(adjusted.remaining, 0)
  assert.equal(adjusted.creditAmount, 200)
  assert.equal(adjusted.creditCount, 1)
})

test('pending benefit credits do not count as used yet', () => {
  const [benefit] = parseCardBenefitRows([['Amex Aspire', 'Hilton Hotel Credit', '200', 'semiannual', 'Travel', 'hilton', '2026-01-01', '', 'TRUE']])
  const usage = calculateBenefitUsage(benefit, [], '2026-06-30')
  const credits = parseBenefitCreditRows([
    ['2026-06-20', 'Amex Aspire', 'Hilton Hotel Credit', '$200', 'Pending', 'Booked, waiting for credit'],
  ])

  const adjusted = applyBenefitCredits(usage, credits)

  assert.equal(adjusted.used, 0)
  assert.equal(adjusted.remaining, 200)
  assert.equal(adjusted.pendingCreditAmount, 200)
})

test('groups benefit usage by normalized card name', () => {
  const benefits = parseCardBenefitRows([
    ['Amex Platinum', 'Resy Credit', '100', 'quarterly', '外食', 'resy', '2026-01-01', '', 'TRUE'],
    ['Amex Brilliant', 'Dining Credit', '25', 'monthly', '外食', '', '2026-01-01', '', 'TRUE'],
  ])
  const rows = [
    expense({ paymentMethod: 'Amex Platinum', description: 'Resy dinner', amount: 44 }),
    expense({ paymentMethod: 'Amex Brilliant', amount: 10 }),
  ]

  const grouped = calculateBenefitUsageByCard(benefits, rows, '2026-06-15')

  assert.equal(grouped.get('amex platinum')[0].used, 44)
  assert.equal(grouped.get('amex brilliant')[0].remaining, 15)
})

test('expands product benefit templates to every matching card', () => {
  const [template] = parseCardBenefitRows([['Amex Platinum', 'Dell Credit', '150', 'annual', '', 'Dell', '2026-01-01', '', 'TRUE']])
  const expanded = expandCardBenefitsForCards([template], [
    { name: 'Amex Platinum (Nick) 01000', product: 'Amex Platinum', subStart: '2026-01-15' },
    { name: 'Amex Platinum (Wife) 02000', product: 'Amex Platinum', subStart: '2026-02-20' },
    { name: 'Amex Platinum (Backup) 03000', product: 'Amex Platinum', subStart: '' },
    { name: 'Amex Gold', product: 'Amex Gold', subStart: '2026-03-01' },
  ])

  assert.deepEqual(expanded.map((benefit) => [benefit.card, benefit.startDate]), [
    ['Amex Platinum (Nick) 01000', '2026-01-15'],
    ['Amex Platinum (Wife) 02000', '2026-02-20'],
    ['Amex Platinum (Backup) 03000', '2026-01-01'],
  ])
})

test('keeps recurring benefit start dates when expanding to cards', () => {
  const [template] = parseCardBenefitRows([['Amex Platinum', 'Uber December Credit', '35', 'annual', '', 'wallet:Uber', '12-01', '12-31', 'TRUE']])
  const expanded = expandCardBenefitsForCards([template], [
    { name: 'Amex Platinum (Nick) 01000', product: 'Amex Platinum', subStart: '2026-01-15' },
  ])

  assert.equal(expanded[0].startDate, '12-01')
})

test('ignores benefit templates without a matching card product', () => {
  const [template] = parseCardBenefitRows([['Amex Gold', 'Dining Credit', '10', 'monthly', '', '', '', '', 'TRUE']])
  const expanded = expandCardBenefitsForCards([template], [
    { name: 'Amex Platinum (Nick) 01000', product: 'Amex Platinum', subStart: '2026-01-15' },
  ])

  assert.deepEqual(expanded, [])
})

test('normalizes card product names by removing owners and last4', () => {
  assert.equal(cardProductKey('Amex Platinum (Nick) 01000'), 'amex platinum')
})
