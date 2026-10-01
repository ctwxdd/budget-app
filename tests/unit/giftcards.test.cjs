const test = require('node:test')
const assert = require('node:assert/strict')

const { giftcardMethodForCard, sameGiftcardName } = require('../../.tmp-test/src/lib/giftcards.js')

test('matches giftcard names without case sensitivity', () => {
  assert.equal(sameGiftcardName(' Costco GC ', 'costco gc'), true)
})

test('keeps legacy payment methods unless same-day cards have unique identifiers', () => {
  const first = { card: 'Costco GC #1', vendor: 'Costco GC', date: '2026-09-30' }
  const second = { card: 'Costco GC #2', vendor: 'Costco GC', date: '2026-09-30' }

  assert.equal(giftcardMethodForCard(first, [first]), 'Costco GC (2026-09-30)')
  assert.equal(giftcardMethodForCard(first, [first, second]), 'Costco GC #1')
  assert.equal(giftcardMethodForCard(second, [first, second]), 'Costco GC #2')
  assert.equal(giftcardMethodForCard(first, [first, { ...second, card: first.card }]), 'Costco GC (2026-09-30)')
})
