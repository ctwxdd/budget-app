import { useQuery } from '@tanstack/react-query'
import { getSheets, isRateLimitError } from '../lib/sheets'
import { parseCurrency } from '../lib/giftcards'
import { readLocalCache, writeLocalCache } from '../lib/localCache'
import { useSheetId } from './useExpenses'

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
}

export type MerchantRow = {
  merchant: string
  cardCount: number
  purchased: number
  spent: number
  balance: number
  active: boolean
}

type GiftcardsData = { cards: GiftcardRow[]; merchants: MerchantRow[]; tabMissing: boolean }
const emptyCards: GiftcardRow[] = []
const emptyMerchants: MerchantRow[] = []
const LOCAL_CACHE_AGE = 5 * 60 * 1000

function isMissingGiftcardTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /Giftcard/i.test(message)
}

function parseBoolean(value: unknown, fallback: boolean) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(true|yes|y|active|1)$/i.test(text)) return true
  if (/^(false|no|n|inactive|0)$/i.test(text)) return false
  return fallback
}

function parseCards(rows: string[][] = []): GiftcardRow[] {
  return rows
    .map((row) => {
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
      }
    })
    .filter((row) => row.card || row.vendor || row.face || row.balance)
}

function parseMerchants(rows: string[][] = []): MerchantRow[] {
  return rows
    .map((row) => {
      const [merchant = '', cardCount = '', purchased = '', spent = '', balance = '', active = ''] = row
      const parsedBalance = parseCurrency(balance)
      return {
        merchant: String(merchant || '').trim(),
        cardCount: Math.round(parseCurrency(cardCount)),
        purchased: parseCurrency(purchased),
        spent: parseCurrency(spent),
        balance: parsedBalance,
        active: parseBoolean(active, parsedBalance > 0),
      }
    })
    .filter((row) => row.merchant || row.cardCount || row.purchased || row.balance)
}

export function useGiftcards() {
  const spreadsheetId = useSheetId()
  const cacheKey = `giftcards.${spreadsheetId}`
  const cached = readLocalCache<GiftcardsData>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<GiftcardsData>({
    queryKey: ['giftcards', spreadsheetId],
    queryFn: async () => {
      try {
        const [cards = {}, merchants = {}] = await getSheets(spreadsheetId, ['Giftcard!A2:J1000', 'Giftcard!L2:Q1000'])
        const data = { cards: parseCards(cards.values || []), merchants: parseMerchants(merchants.values || []), tabMissing: false }
        writeLocalCache(cacheKey, data)
        return data
      } catch (error) {
        if (isMissingGiftcardTab(error)) return { cards: [], merchants: [], tabMissing: true }
        throw error
      }
    },
    enabled: Boolean(spreadsheetId),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: LOCAL_CACHE_AGE,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isRateLimitError(error) ? failureCount < 2 : failureCount < 1,
  })

  return {
    cards: query.data?.cards || emptyCards,
    merchants: query.data?.merchants || emptyMerchants,
    tabMissing: query.data?.tabMissing || false,
    isLoading: query.isLoading,
    error: query.error,
  }
}
