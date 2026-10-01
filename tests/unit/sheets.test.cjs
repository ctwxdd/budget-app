const test = require('node:test')
const assert = require('node:assert/strict')

const { nextBenefitCreditRowIndex, nextCardBenefitRowIndex } = require('../../.tmp-test/src/lib/sheets.js')
const { addRowDeveloperMetadata, getRowDeveloperMetadata, setSheetsAuth } = require('../../.tmp-test/src/lib/sheets.js')

test('places new card benefits after the last real benefit row', () => {
  const rows = [
    ['Amex Platinum', 'Dell Credit', '$150', 'annual', '', 'Dell', '2026-06-30', '', 'TRUE'],
    ['', '', '', '', '', '', '', '', 'FALSE'],
    ['', '', '', 'annual', '', '', '', '', 'FALSE'],
  ]

  assert.equal(nextCardBenefitRowIndex(rows), 3)
})

test('places new benefit credits after the last real credit row', () => {
  const rows = [
    ['2026-06-30', 'Amex Platinum', 'Dell Credit', '$150', 'Received', ''],
    ['', '', '', '', 'Received', ''],
    ['', '', '', '', 'Pending', ''],
  ]

  assert.equal(nextBenefitCreditRowIndex(rows), 3)
})

test('searches row metadata using the Sheets metadata search API and creates metadata at the expense row', async () => {
  const originalFetch = global.fetch
  const calls = []
  setSheetsAuth({ getToken: async () => 'test-token' })
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(calls.length === 1 ? {
      matchedDeveloperMetadata: [{ developerMetadata: {
        metadataId: 12, metadataKey: 'cgc', metadataValue: 'compactId',
        location: { dimensionRange: { sheetId: 7, dimension: 'ROWS', startIndex: 3, endIndex: 4 } },
      } }],
    } : {}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const metadata = await getRowDeveloperMetadata('sheet-id', 7, 'cgc')
    assert.equal(calls[0].url, 'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/developerMetadata:search')
    assert.deepEqual(JSON.parse(calls[0].init.body), { dataFilters: [{ developerMetadataLookup: { metadataKey: 'cgc', visibility: 'DOCUMENT' } }] })
    assert.equal(metadata[0].metadataValue, 'compactId')

    await addRowDeveloperMetadata('sheet-id', [{ sheetGid: 7, rowIndex: 4, key: 'cgc', value: 'anotherId' }])
    const request = JSON.parse(calls[1].init.body).requests[0].createDeveloperMetadata.developerMetadata
    assert.deepEqual(request.location.dimensionRange, { sheetId: 7, dimension: 'ROWS', startIndex: 3, endIndex: 4 })
    assert.equal(request.metadataKey, 'cgc')
    assert.equal(request.metadataValue, 'anotherId')
  } finally {
    global.fetch = originalFetch
  }
})

test('accepts omitted default sheetId 0 but rejects missing or mismatched nonzero sheet IDs', async () => {
  const originalFetch = global.fetch
  setSheetsAuth({ getToken: async () => 'test-token' })
  global.fetch = async () => new Response(JSON.stringify({ matchedDeveloperMetadata: [
    { developerMetadata: { metadataId: 1, metadataKey: 'cgc', metadataValue: 'default', location: { dimensionRange: { dimension: 'ROWS', startIndex: 0, endIndex: 1 } } } },
    { developerMetadata: { metadataId: 2, metadataKey: 'cgc', metadataValue: 'wrong-sheet', location: { dimensionRange: { sheetId: 8, dimension: 'ROWS', startIndex: 0, endIndex: 1 } } } },
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  try {
    assert.deepEqual((await getRowDeveloperMetadata('sheet-id', 0, 'cgc')).map((item) => item.metadataValue), ['default'])
    assert.deepEqual(await getRowDeveloperMetadata('sheet-id', 7, 'cgc'), [])
  } finally {
    global.fetch = originalFetch
  }
})
