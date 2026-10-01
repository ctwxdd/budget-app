import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { addRowDeveloperMetadata, getRowDeveloperMetadata, getSheet, getSheets, getSheetMeta, isRateLimitError, rowDeveloperMetadataByRow } from '../lib/sheets'
import { allocateGiftcardLedger, giftcardActiveColumnIsComputed, giftcardRowsAreGrouped, giftcardRowsMissingMetadata, matchGiftcardSourcePurchases, newGiftcardPurchaseId, parseCurrency } from '../lib/giftcards'
import { useExpenses, useSheetId } from './useExpenses'

export type GiftcardRow = {
  card: string
  date: string
  paid: number
  face: number
  vendor: string
  direct: number
  pool: number
  cumBefore: number
  fifo: number
  balance: number
  rowIndex: number
  sourceRowIndex?: number
  id?: string
  aliases?: string[]
}

export type MerchantRow = {
  merchant: string
  cardCount: number
  purchased: number
  spent: number
  balance: number
  active: boolean
  manualActive?: boolean
}

type GiftcardsData = { cards: GiftcardRow[]; merchants: MerchantRow[]; tabMissing: boolean }
const emptyCards: GiftcardRow[] = []
const emptyMerchants: MerchantRow[] = []

function isMissingGiftcardTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /Giftcard/i.test(message)
}

function parseCards(rows: string[][] = []): GiftcardRow[] {
  return rows
    .map((row, index) => {
      const [card = '', date = '', paid = '', face = '', vendor = '', direct = '', pool = '', cumBefore = '', fifo = '', balance = ''] = row
      return {
        card: String(card || '').trim(),
        date: String(date || '').trim(),
        paid: parseCurrency(paid),
        face: parseCurrency(face),
        vendor: String(vendor || '').trim(),
        direct: parseCurrency(direct),
        pool: parseCurrency(pool),
        cumBefore: parseCurrency(cumBefore),
        fifo: parseCurrency(fifo),
        balance: parseCurrency(balance),
        rowIndex: index + 2,
      }
    })
    .filter((row) => row.card || row.vendor || row.face || row.balance)
}

function parseMerchants(rows: string[][] = [], activeFormulas: string[][] = []): MerchantRow[] {
  const computedSpill = giftcardActiveColumnIsComputed(activeFormulas)
  return rows.map((row, index) => {
    const [merchant = '', cardCount = '', purchased = '', spent = '', balance = '', active = ''] = row
    const parsedBalance = parseCurrency(balance)
    const formula = activeFormulas[index]?.[0] || ''
    const text = String(active).trim()
    const manualActive = computedSpill || formula.startsWith('=') ? undefined : /^(true|yes|y|active|1)$/i.test(text) ? true : /^(false|no|n|inactive|0)$/i.test(text) ? false : undefined
    return { merchant: String(merchant || '').trim(), cardCount: Math.round(parseCurrency(cardCount)), purchased: parseCurrency(purchased), spent: parseCurrency(spent), balance: parsedBalance, active: manualActive ?? parsedBalance > 0, manualActive }
  }).filter((row) => row.merchant || row.cardCount || row.purchased || row.balance)
}

export function useGiftcards() {
  const spreadsheetId = useSheetId()
  const expensesQuery = useExpenses({ requireFresh: true })
  const expenses = expensesQuery.data || []
  const purchaseSignature = React.useMemo(() => JSON.stringify(expenses
    .filter(({ description, category }) => category.trim().toLocaleLowerCase() === 'giftcard' || /\bgc\b|gift\s*card/i.test(description))
    .map(({ rowIndex, date, amount, description, category }) => [rowIndex, date, amount, description, category])), [expenses])
  const query = useQuery<GiftcardsData>({
    queryKey: ['giftcards', spreadsheetId, purchaseSignature],
    queryFn: async () => {
      try {
        const [[cards = {}, merchants = {}], meta, activeFormulas, cardFormula] = await Promise.all([
          getSheets(spreadsheetId, ['Giftcard!A2:J1000', 'Giftcard!L2:Q1000']),
          getSheetMeta(spreadsheetId),
          getSheet(spreadsheetId, 'Giftcard!Q2:Q1000', 'FORMULA'),
          getSheet(spreadsheetId, 'Giftcard!A2:A2', 'FORMULA'),
        ])
        const rawCards = parseCards(cards.values || [])
        const groupedRows = giftcardRowsAreGrouped(cardFormula.values || [])
        const sheetGid = meta.sheets.find((sheet) => sheet.title === 'Expense')?.sheetId
        if (sheetGid === undefined) throw new Error('Could not find an Expense tab in this spreadsheet.')
        let metadata = await getRowDeveloperMetadata(spreadsheetId, sheetGid, 'cgc')
        const idsByExpenseRow = rowDeveloperMetadataByRow(metadata)
        const sourceRows = matchGiftcardSourcePurchases(rawCards, expenses, new Map(), groupedRows)
          .flatMap((card) => card.sourceRowIndex === undefined ? [] : [card.sourceRowIndex])
        const missingRows = giftcardRowsMissingMetadata(sourceRows, idsByExpenseRow)
        if (missingRows.length) {
          await addRowDeveloperMetadata(spreadsheetId, missingRows.map((rowIndex) => ({ sheetGid, rowIndex, key: 'cgc', value: newGiftcardPurchaseId() })))
          metadata = await getRowDeveloperMetadata(spreadsheetId, sheetGid, 'cgc')
        }
        const sourcedCards = matchGiftcardSourcePurchases(rawCards, expenses, rowDeveloperMetadataByRow(metadata), groupedRows)
        const data = { cards: sourcedCards, merchants: parseMerchants(merchants.values || [], activeFormulas.values || []), tabMissing: false }
        return data
      } catch (error) {
        if (isMissingGiftcardTab(error)) return { cards: [], merchants: [], tabMissing: true }
        throw error
      }
    },
    enabled: Boolean(spreadsheetId) && expensesQuery.isFetched && !expensesQuery.isError && !expensesQuery.isFetching,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === spreadsheetId ? previous : undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isRateLimitError(error) ? failureCount < 2 : failureCount < 1,
  })

  const cards = React.useMemo(() => allocateGiftcardLedger(query.data?.cards || emptyCards, expenses), [query.data?.cards, expenses])
  const calculatedMerchants = React.useMemo(() => {
    const totals = new Map<string, MerchantRow>()
    for (const card of cards) {
      const key = card.vendor.trim().toLocaleLowerCase()
      const merchant = totals.get(key) || { merchant: card.vendor, cardCount: 0, purchased: 0, spent: 0, balance: 0, active: false }
      merchant.cardCount += 1
      merchant.purchased += card.face
      merchant.spent += card.direct + card.fifo
      merchant.balance += card.balance
      totals.set(key, merchant)
    }
    return [...totals.values()].map((merchant) => {
      const existing = query.data?.merchants.find((item) => item.merchant.trim().toLocaleLowerCase() === merchant.merchant.trim().toLocaleLowerCase())
      return { ...merchant, active: existing?.manualActive ?? merchant.balance > 0.005 }
    })
  }, [cards, query.data?.merchants])
  const waitingForFreshExpenses = Boolean(spreadsheetId) && (!expensesQuery.isFetched || expensesQuery.isError || expensesQuery.isFetching)
  return {
    cards: waitingForFreshExpenses && !query.data ? emptyCards : cards,
    merchants: waitingForFreshExpenses && !query.data ? emptyMerchants : calculatedMerchants.length ? calculatedMerchants : query.data?.merchants || emptyMerchants,
    tabMissing: waitingForFreshExpenses ? false : query.data?.tabMissing || false,
    isLoading: (query.isLoading || expensesQuery.isLoading || waitingForFreshExpenses) && !query.data,
    error: query.error || expensesQuery.error,
  }
}
