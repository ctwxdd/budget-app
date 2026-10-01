const test = require('node:test')
const assert = require('node:assert/strict')

const {
  cardForGiftcardMethod,
  classifyGiftcardPaymentMethod,
  giftcardMethodForCard,
  resolveGiftcardMethod,
  sameGiftcardName,
} = require('../../.tmp-test/src/lib/giftcards.js')
const { normalizeDateCell } = require('../../.tmp-test/src/lib/dates.js')

test('matches giftcard names without case sensitivity', () => {
  assert.equal(sameGiftcardName(' Costco GC ', 'costco gc'), true)
})

test('uses vendor and normalized date for Direct formula matching, not the Giftcard card description', () => {
  const card = {
    card: 'H&M GC $23.14 (Return: H&M (2026-07-03))',
    date: '8/19/2026',
    vendor: 'H&M GC',
    face: 23.14,
  }
  const expenses = [{ paymentMethod: 'H&M GC (2026-08-19)', amount: 23.14 }]
  const formulaCriteria = `${card.vendor} (${normalizeDateCell(card.date)})`

  assert.equal(giftcardMethodForCard(card), 'H&M GC (2026-08-19)')
  assert.equal(classifyGiftcardPaymentMethod(giftcardMethodForCard(card), [card]), 'giftcard')
  const direct = expenses
    .filter((expense) => sameGiftcardName(expense.paymentMethod, formulaCriteria))
    .reduce((sum, expense) => sum + expense.amount, 0)
  assert.equal(direct, 23.14)
  assert.equal(card.face - direct, 0)
})

test('reads case-insensitive canonical and legacy vendor/date methods', () => {
  const card = { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '8/19/2026' }

  assert.equal(resolveGiftcardMethod('h&m gc (2026-08-19)', [card]), 'H&M GC (2026-08-19)')
  assert.equal(resolveGiftcardMethod('h&m gc (8/19/2026)', [card]), 'H&M GC (2026-08-19)')
  assert.equal(classifyGiftcardPaymentMethod('h&m gc (8/19/2026)', [card]), 'giftcard')
})

test('does not guess which same-vendor/date card an existing method identifies', () => {
  const first = { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '8/19/2026' }
  const second = { card: 'H&M GC $25.00', vendor: 'H&M GC', date: '2026-08-19' }
  const cards = [first, second]

  assert.equal(giftcardMethodForCard(first), 'H&M GC (2026-08-19)')
  assert.equal(giftcardMethodForCard(second), 'H&M GC (2026-08-19)')
  assert.equal(cardForGiftcardMethod('H&M GC (2026-08-19)', cards), undefined)
  assert.equal(resolveGiftcardMethod('H&M GC (8/19/2026)', cards), 'H&M GC (8/19/2026)')
  assert.equal(resolveGiftcardMethod('H&M GC (2026-08-19)', cards), 'H&M GC (2026-08-19)')
})

test('reads historical card descriptions as aliases and migrates only unique formula identities', () => {
  const unique = { card: 'H&M GC $23.14 (Return: H&M (2026-07-03))', vendor: 'H&M GC', date: '8/19/2026' }
  const alias = 'h&m gc $23.14 (return: h&m (2026-07-03))'
  assert.equal(classifyGiftcardPaymentMethod(alias, [unique]), 'giftcard')
  assert.equal(cardForGiftcardMethod(alias, [unique]), unique)
  assert.equal(resolveGiftcardMethod(alias, [unique]), 'H&M GC (2026-08-19)')

  const duplicate = { card: 'H&M GC $25.00 (Return: H&M (2026-07-03))', vendor: 'H&M GC', date: '2026-08-19' }
  const cards = [unique, duplicate]
  const duplicateAlias = 'H&M GC $25.00 (Return: H&M (2026-07-03))'
  assert.equal(classifyGiftcardPaymentMethod(duplicateAlias, cards), 'giftcard')
  assert.equal(cardForGiftcardMethod(duplicateAlias, cards), duplicate)
  assert.equal(resolveGiftcardMethod(duplicateAlias, cards), duplicateAlias)
})

test('recognizes a known vendor even when its name has no giftcard marker', () => {
  const card = { card: 'Target $50', vendor: 'Target', date: '2026-08-19' }
  assert.equal(classifyGiftcardPaymentMethod('Target', [card]), 'giftcard')
  assert.equal(classifyGiftcardPaymentMethod('Visa', []), 'card')
  assert.equal(classifyGiftcardPaymentMethod('Cash', []), 'cash')
})
