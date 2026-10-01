const test = require('node:test')
const assert = require('node:assert/strict')

const {
  addMonthsIso,
  dateToIsoDate,
  daysBetweenIso,
  normalizeDateCell,
  parseSheetDate,
} = require('../../.tmp-test/src/lib/dates.js')
const { displayDate } = require('../../.tmp-test/src/lib/format.js')

test('formats date objects from local calendar fields instead of UTC serialization', () => {
  const localLateNight = new Date(2026, 5, 30, 23, 30)

  assert.equal(dateToIsoDate(localLateNight), '2026-06-30')
  assert.equal(normalizeDateCell(localLateNight), '2026-06-30')
})

test('normalizes slash-formatted Sheets dates to ISO date-only values', () => {
  assert.equal(normalizeDateCell('8/19/2026'), '2026-08-19')
  assert.equal(normalizeDateCell('8/21/2026'), '2026-08-21')
})

test('parses Sheet date formats with a single matching parser and preserves invalid-date fallback', () => {
  assert.equal(parseSheetDate('2026-08-19'), '2026-08-19')
  assert.equal(parseSheetDate('8/19/2026'), '2026-08-19')
  assert.equal(parseSheetDate('Aug 19, 2026'), '2026-08-19')
  assert.equal(parseSheetDate('not a date'), '')
})

test('displays legacy and ISO dates as YYYY-MM-DD and preserves invalid-date fallback', () => {
  assert.equal(displayDate('2026-08-19'), '2026-08-19')
  assert.equal(displayDate('8/21/2026'), '2026-08-21')
  assert.equal(displayDate('not a date'), 'Unknown date')
})

test('adds months and counts days using local date-only values', () => {
  assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28')
  assert.equal(daysBetweenIso('2026-06-30', '2026-07-01'), 1)
})
