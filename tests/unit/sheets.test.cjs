const test = require('node:test')
const assert = require('node:assert/strict')

const { nextCardBenefitRowIndex } = require('../../.tmp-test/src/lib/sheets.js')

test('places new card benefits after the last real benefit row', () => {
  const rows = [
    ['Amex Platinum', 'Dell Credit', '$150', 'annual', '', 'Dell', '2026-06-30', '', 'TRUE'],
    ['', '', '', '', '', '', '', '', 'FALSE'],
    ['', '', '', 'annual', '', '', '', '', 'FALSE'],
  ]

  assert.equal(nextCardBenefitRowIndex(rows), 3)
})

