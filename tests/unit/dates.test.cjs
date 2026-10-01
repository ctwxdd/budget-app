const test = require('node:test')
const assert = require('node:assert/strict')

const {
  addMonthsIso,
  dateToIsoDate,
  daysBetweenIso,
  normalizeDateCell,
} = require('../../.tmp-test/src/lib/dates.js')

test('formats date objects from local calendar fields instead of UTC serialization', () => {
  const localLateNight = new Date(2026, 5, 30, 23, 30)

  assert.equal(dateToIsoDate(localLateNight), '2026-06-30')
  assert.equal(normalizeDateCell(localLateNight), '2026-06-30')
})

test('normalizes slash-formatted Sheets dates to ISO date-only values', () => {
  assert.equal(normalizeDateCell('8/19/2026'), '2026-08-19')
  assert.equal(normalizeDateCell('8/21/2026'), '2026-08-21')
})

test('adds months and counts days using local date-only values', () => {
  assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28')
  assert.equal(daysBetweenIso('2026-06-30', '2026-07-01'), 1)
})
