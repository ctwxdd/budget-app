const test = require('node:test')
const assert = require('node:assert/strict')

const {
  allocateGiftcardLedger,
  cardForGiftcardMethod,
  classifyGiftcardPaymentMethod,
  giftcardActiveColumnIsComputed,
  giftcardRowsAreGrouped,
  giftcardMethodForCard,
  giftcardRowsMissingMetadata,
  giftcardSourcePurchaseRowIndexes,
  matchGiftcardSourcePurchases,
  newGiftcardPurchaseId,
  resolveGiftcardMethod,
  sameGiftcardName,
} = require('../../.tmp-test/src/lib/giftcards.js')

const expense = (rowIndex, amount, paymentMethod, values = {}) => ({
  rowIndex, amount, paymentMethod, date: '2026-08-20', description: 'Clothes', category: 'Shopping', reimbursement: '', tags: '', ...values,
})
const card = (id, face, values = {}) => ({ id, card: `H&M GC ${face}`, vendor: 'H&M GC', date: '2026-08-19', paid: face, face, rowIndex: values.rowIndex ?? 2, sourceRowIndex: values.sourceRowIndex, ...values })

test('matches giftcard names without case sensitivity', () => {
  assert.equal(sameGiftcardName(' Costco GC ', 'costco gc'), true)
})

test('separate same-date card methods spend only the selected purchase', () => {
  const cards = [card('id-A', 23.14), card('id-B', 20.90)]
  const firstMethod = giftcardMethodForCard(cards[0])
  const ledger = allocateGiftcardLedger(cards, [expense(40, 23.14, firstMethod)])

  assert.equal(ledger[0].balance, 0)
  assert.equal(ledger[1].balance, 20.90)
  assert.equal(ledger[0].direct, 23.14)
})

test('reserves explicit spends before ambiguous legacy date spends', () => {
  const cards = [card('id-A', 11.47), card('id-B', 20.90)]
  const ledger = allocateGiftcardLedger(cards, [
    expense(2, 10, 'H&M GC (2026-08-19)'),
    expense(3, 10, giftcardMethodForCard(cards[1])),
  ])

  assert.deepEqual(ledger.map((item) => item.balance), [1.47, 10.90])
  assert.equal(ledger.reduce((sum, item) => sum + item.direct, 0), 20)
})

test('allocates each ambiguous date spend once across matching cards by source purchase order', () => {
  const ledger = allocateGiftcardLedger([card('id-A', 11.47), card('id-B', 20.90)], [expense(2, 20, 'H&M GC (8/19/2026)')])
  assert.deepEqual(ledger.map((item) => item.balance), [0, 12.37])
  assert.equal(ledger.reduce((sum, item) => sum + item.direct, 0), 20)
})

test('merchant-only FIFO spends and signed refunds use cents and span cards', () => {
  const cards = [card('id-A', 11.47), card('id-B', 20.90)]
  const ledger = allocateGiftcardLedger(cards, [expense(2, 20, 'h&m gc'), expense(3, -5, 'H&M GC')])
  assert.deepEqual(ledger.map((item) => item.balance), [0, 17.37])
  assert.equal(ledger.reduce((sum, item) => sum + item.fifo, 0), 15)
})

test('refunds follow the designated card and unknown/deleted IDs never fall back to FIFO', () => {
  const [selected, other] = [card('purchase-A', 23.14), card('purchase-B', 20.90)]
  const ledger = allocateGiftcardLedger([selected, other], [
    expense(3, 23.14, giftcardMethodForCard(selected)),
    expense(4, -2, giftcardMethodForCard(selected)),
    expense(5, 10, 'H&M GC (2026-08-19) [gc:deleted-ID]'),
  ])
  assert.equal(ledger.find((item) => item.id === 'purchase-A').balance, 2)
  assert.equal(ledger.find((item) => item.id === 'purchase-B').balance, 20.90)
})

test('switching a designated card moves later charges to the newly selected card', () => {
  const cards = [card('id-A', 20), card('id-B', 20, { rowIndex: 3 })]
  const first = allocateGiftcardLedger(cards, [expense(2, 6, giftcardMethodForCard(cards[0]))])
  const switched = allocateGiftcardLedger(cards, [expense(2, 6, giftcardMethodForCard(cards[1]))])
  assert.deepEqual(first.map((item) => item.balance), [14, 20])
  assert.deepEqual(switched.map((item) => item.balance), [20, 14])
})

test('split payment rows apply each amount to its designated card', () => {
  const cards = [card('id-A', 20), card('id-B', 20, { rowIndex: 3 })]
  const ledger = allocateGiftcardLedger(cards, [
    expense(2, 4.25, giftcardMethodForCard(cards[0])),
    expense(3, 5.75, giftcardMethodForCard(cards[1])),
  ])
  assert.deepEqual(ledger.map((item) => item.balance), [15.75, 14.25])
})

test('keeps card IDs case-sensitive and resolves saved duplicate aliases to their source card', () => {
  const first = { ...card('abcDEF_123'), aliases: ['oldAlias'] }
  const second = { ...card('abcdef_123') }
  assert.equal(cardForGiftcardMethod('H&M GC (2026-08-19) [gc:oldAlias]', [first, second]), first)
  assert.equal(cardForGiftcardMethod('H&M GC (2026-08-19) [gc:abcDEF_123]', [first, second]), first)
  assert.equal(cardForGiftcardMethod('H&M GC (2026-08-19) [gc:ABCDEF_123]', [first, second]), undefined)
  assert.equal(resolveGiftcardMethod('H&M GC (2026-08-19) [gc:deleted]', [first, second]), 'H&M GC (2026-08-19) [gc:deleted]')
})

test('keeps normalized legacy/date and exact card aliases backward compatible', () => {
  const one = { ...card('id-A', 23.14), card: 'H&M GC $23.14' }
  assert.equal(resolveGiftcardMethod('h&m gc (8/19/2026)', [one]), giftcardMethodForCard(one))
  assert.equal(classifyGiftcardPaymentMethod('H&M GC $23.14', [one]), 'giftcard')
  assert.equal(classifyGiftcardPaymentMethod('Visa', [one]), 'card')
  assert.equal(classifyGiftcardPaymentMethod('Cash', []), 'cash')
  assert.equal(resolveGiftcardMethod('H&M GC (2026-08-19) [gone]', [one]), 'H&M GC (2026-08-19) [gone]')
})

test('links duplicate and face-optional purchases one-to-one to row metadata', () => {
  const purchase = (rowIndex, description, amount = 23.14) => expense(rowIndex, amount, 'Visa', { date: '8/19/2026', category: 'Giftcard', description })
  const expenses = [purchase(14, 'H&M GC $23.14'), purchase(15, 'H&M GC $23.14'), purchase(16, 'Costco GC', 25)]
  const cards = [
    { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '2026-08-19', paid: 23.14, face: 23.14, rowIndex: 2 },
    { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '8/19/2026', paid: 23.14, face: 23.14, rowIndex: 3 },
    { card: 'Costco GC', vendor: 'Costco GC', date: '2026-08-19', paid: 25, face: 25, rowIndex: 4 },
  ]
  const sourced = matchGiftcardSourcePurchases(cards, expenses, new Map([[14, ['first']], [15, ['second']], [16, ['third']]]))
  assert.deepEqual(sourced.map((item) => [item.sourceRowIndex, item.id]), [[14, 'first'], [15, 'second'], [16, 'third']])
  assert.deepEqual(giftcardSourcePurchaseRowIndexes(expenses), [14, 15, 16])
})

test('links exact Target purchase names without requiring a GC/Gift marker', () => {
  const purchase = expense(32, 50, 'Visa', { date: '2026-08-19', category: 'Giftcard', description: 'Target $50' })
  const targetCard = { card: 'Target $50', vendor: 'Target', date: '2026-08-19', paid: 50, face: 50, rowIndex: 2 }
  const [linked] = matchGiftcardSourcePurchases([targetCard], [purchase], new Map([[32, ['target-id']]]))
  assert.equal(linked.sourceRowIndex, 32)
  assert.equal(linked.id, 'target-id')
})

test('links legacy return-funded zero-paid cards by exact name and date, independent of category or amount', () => {
  const expenses = [
    expense(21, 11.47, 'H&M store credit', { date: '8/2/2026', category: 'Shopping', description: 'H&M GC $11.47' }),
    expense(22, 20.90, 'H&M store credit', { date: '2026-08-02', category: 'Giftcard', description: 'H&M GC $20.90' }),
  ]
  const cards = [
    { card: 'H&M GC $11.47', vendor: 'H&M GC', date: '2026-08-02', paid: 0, face: 11.47, rowIndex: 2 },
    { card: 'H&M GC $20.90', vendor: 'H&M GC', date: '8/2/2026', paid: 0, face: 20.90, rowIndex: 3 },
  ]
  const sourced = matchGiftcardSourcePurchases(cards, expenses, new Map([[21, ['legacy-one']], [22, ['legacy-two']]]))
  assert.deepEqual(sourced.map(({ sourceRowIndex, id }) => [sourceRowIndex, id]), [[21, 'legacy-one'], [22, 'legacy-two']])
  assert.deepEqual(giftcardRowsMissingMetadata(sourced.flatMap(({ sourceRowIndex }) => sourceRowIndex ? [sourceRowIndex] : []), new Map()), [21, 22])
})

test('matches return-annotated source rows with equivalent face-value formatting', () => {
  const expenses = [
    expense(3365, 0, 'H&M GC', { date: '8/2/2026', category: 'Giftcard', description: 'H&M GC $20.9 (Return: H&M (2026-07-02))' }),
    expense(3366, 0, 'H&M GC', { date: '8/2/2026', category: 'Giftcard', description: 'H&M GC $11.47 (Return: H&M (2026-07-02))' }),
  ]
  const cards = [
    { card: 'H&M GC $11.47', vendor: 'H&M GC', date: '2026-08-02', paid: 0, face: 11.47, rowIndex: 97 },
    { card: 'H&M GC $20.90', vendor: 'H&M GC', date: '2026-08-02', paid: 0, face: 20.90, rowIndex: 98 },
  ]
  const sourced = matchGiftcardSourcePurchases(cards, expenses, new Map([[3365, ['gc-20']], [3366, ['gc-11']]]))
  assert.deepEqual(sourced.map(({ sourceRowIndex, id }) => [sourceRowIndex, id]), [[3366, 'gc-11'], [3365, 'gc-20']])
})

test('tracks actual return-issued same-day cards and the 23.14 legacy spend', () => {
  const expenses = [
    expense(3365, 0, 'H&M GC', { date: '8/2/2026', category: 'Giftcard', description: 'H&M GC $20.9 (Return: H&M (2026-07-02))' }),
    expense(3366, 0, 'H&M GC', { date: '8/2/2026', category: 'Giftcard', description: 'H&M GC $11.47 (Return: H&M (2026-07-02))' }),
    expense(3395, 0, 'H&M GC', { date: '8/19/2026', category: 'Giftcard', description: 'H&M GC $23.14 (Return: H&M (2026-07-03))' }),
    expense(3456, 23.14, 'H&M GC (2026-08-19)', { date: '9/30/2026' }),
  ]
  const cards = [
    { card: 'H&M GC $11.47 (Return: H&M (2026-07-02))', vendor: 'H&M GC', date: '2026-08-02', paid: 0, face: 11.47, rowIndex: 97 },
    { card: 'H&M GC $20.9 (Return: H&M (2026-07-02))', vendor: 'H&M GC', date: '2026-08-02', paid: 0, face: 20.9, rowIndex: 98 },
    { card: 'H&M GC $23.14 (Return: H&M (2026-07-03))', vendor: 'H&M GC', date: '8/19/2026', paid: 0, face: 23.14, rowIndex: 101 },
  ]
  const sourced = matchGiftcardSourcePurchases(cards, expenses, new Map([[3365, ['gc-20']], [3366, ['gc-11']], [3395, ['gc-23']]]))
  assert.deepEqual(sourced.map(({ sourceRowIndex }) => sourceRowIndex), [3366, 3365, 3395])
  assert.equal(allocateGiftcardLedger(sourced, expenses).find(({ sourceRowIndex }) => sourceRowIndex === 3395).balance, 0)
})

test('expands identical purchases collapsed into one Giftcard query row', () => {
  const source = (rowIndex) => expense(rowIndex, 80, 'Visa', { date: '2026-08-19', category: 'Giftcard', description: 'H&M GC $100' })
  const groupedCard = { card: 'H&M GC $100', vendor: 'H&M GC', date: '2026-08-19', paid: 160, face: 100, rowIndex: 2 }
  const sourced = matchGiftcardSourcePurchases([groupedCard], [source(20), source(21)], new Map([[20, ['first']], [21, ['second']]]), true)
  assert.deepEqual(sourced.map(({ sourceRowIndex, paid, face, id }) => [sourceRowIndex, paid, face, id]), [[20, 80, 100, 'first'], [21, 80, 100, 'second']])
  const ledger = allocateGiftcardLedger(sourced, [expense(30, 10, giftcardMethodForCard(sourced[1]))])
  assert.deepEqual(ledger.map(({ balance }) => balance), [100, 90])
})

test('expands grouped face-optional cards using each source amount as face value', () => {
  const source = (rowIndex, amount) => expense(rowIndex, amount, 'Visa', { date: '2026-08-19', category: 'Giftcard', description: 'Costco' })
  const groupedCard = { card: 'Costco', vendor: 'Costco', date: '2026-08-19', paid: 150, face: 150, rowIndex: 2 }
  const sourced = matchGiftcardSourcePurchases([groupedCard], [source(20, 50), source(21, 100)], new Map(), true)
  assert.deepEqual(sourced.map(({ paid, face }) => [paid, face]), [[50, 50], [100, 100]])
})

test('detects the existing grouped Giftcard query before expanding cards', () => {
  assert.equal(giftcardRowsAreGrouped([['=QUERY(Expense!A2:E, "select C, A, sum(B) group by C, A", 0)']]), true)
  assert.equal(giftcardRowsAreGrouped([['manual card rows']]), false)
})

test('keeps purchase IDs attached to identical source rows after insert, reorder, and delete', () => {
  const purchase = (rowIndex) => expense(rowIndex, 23.14, 'Visa', { date: '8/19/2026', category: 'Giftcard', description: 'H&M GC $23.14' })
  const cardRows = [
    { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '2026-08-19', paid: 23.14, face: 23.14, rowIndex: 2 },
    { card: 'H&M GC $23.14', vendor: 'H&M GC', date: '2026-08-19', paid: 23.14, face: 23.14, rowIndex: 3 },
  ]
  const afterInsert = matchGiftcardSourcePurchases(cardRows, [purchase(15), purchase(16)], new Map([[15, ['one']], [16, ['two']]]))
  assert.deepEqual(afterInsert.map((item) => [item.sourceRowIndex, item.id]), [[15, 'one'], [16, 'two']])

  const afterDeleteFirst = matchGiftcardSourcePurchases([cardRows[1]], [purchase(16)], new Map([[16, ['two']]]))
  assert.deepEqual(afterDeleteFirst.map((item) => [item.sourceRowIndex, item.id]), [[16, 'two']])
})

test('row-bound IDs survive row moves and deleted metadata disappears from the mapping', () => {
  const { rowDeveloperMetadataByRow } = require('../../.tmp-test/src/lib/sheets.js')
  const moved = rowDeveloperMetadataByRow([
    { metadataKey: 'cgc', metadataValue: 'id-one', location: { dimensionRange: { dimension: 'ROWS', sheetId: 9, startIndex: 3 } } },
    { metadataKey: 'cgc', metadataValue: 'id-two', location: { dimensionRange: { dimension: 'ROWS', sheetId: 9, startIndex: 3 } } },
    { metadataKey: 'cgc', metadataValue: 'deleted-row', location: { dimensionRange: { dimension: 'ROWS', sheetId: 9, startIndex: 7 } } },
  ])
  assert.deepEqual(moved.get(4), ['id-one', 'id-two'])
  assert.deepEqual(moved.get(8), ['deleted-row'])
  const afterDelete = rowDeveloperMetadataByRow([
    { metadataKey: 'cgc', metadataValue: 'id-one', location: { dimensionRange: { dimension: 'ROWS', sheetId: 9, startIndex: 3 } } },
  ])
  assert.equal(afterDelete.has(8), false)
  assert.deepEqual(giftcardRowsMissingMetadata([4, 4, 8], moved), [])
  assert.deepEqual(giftcardRowsMissingMetadata([4, 8, 9], afterDelete), [8, 9])
})

test('generates compact 128-bit base64url purchase IDs', () => {
  const id = newGiftcardPurchaseId()
  assert.match(id, /^[A-Za-z0-9_-]{22}$/)
  assert.notEqual(id, newGiftcardPurchaseId())
})

test('recognizes Q-column MAP spill formulas as computed values', () => {
  assert.equal(giftcardActiveColumnIsComputed([['=MAP(L2:L,LAMBDA(x,TRUE))'], ['TRUE']]), true)
  assert.equal(giftcardActiveColumnIsComputed([['FALSE'], ['TRUE']]), false)
})
