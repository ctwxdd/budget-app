import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addCard, createCardsTab, deleteCard, getSheet, getSheetMeta, updateCard, type CardSheetInput } from '../lib/sheets'
import { clearLocalCache, readLocalCache, writeLocalCache } from '../lib/localCache'
import { useSheetId, useSheetMeta } from './useExpenses'

export type CardRow = {
  rowIndex: number
  name: string
  issuer: string
  last4: string
  active: boolean
  note: string
}

type CardsData = { cards: CardRow[]; tabMissing: boolean }
const emptyCards: CardRow[] = []
const LOCAL_CACHE_AGE = 5 * 60 * 1000

function parseBoolean(value: unknown, fallback: boolean) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(true|yes|y|active|1)$/i.test(text)) return true
  if (/^(false|no|n|inactive|0)$/i.test(text)) return false
  return fallback
}

function isMissingCardsTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /Cards/i.test(message)
}

function parseCards(rows: string[][] = []): CardRow[] {
  return rows
    .map((row, index) => {
      const [name = '', issuer = '', last4 = '', active = '', note = ''] = row
      return {
        rowIndex: index + 2,
        name: String(name || '').trim(),
        issuer: String(issuer || '').trim(),
        last4: String(last4 || '').trim(),
        active: parseBoolean(active, true),
        note: String(note || '').trim(),
      }
    })
    .filter((card) => card.name || card.issuer || card.last4 || card.note)
}

export function useCards() {
  const sheetId = useSheetId()
  const cacheKey = `cards.${sheetId}`
  const cached = readLocalCache<CardsData>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<CardsData>({
    queryKey: ['cards', sheetId],
    queryFn: async () => {
      try {
        const data = { cards: parseCards((await getSheet(sheetId, 'Cards!A2:E1000')).values || []), tabMissing: false }
        writeLocalCache(cacheKey, data)
        return data
      } catch (error) {
        if (isMissingCardsTab(error)) return { cards: [], tabMissing: true }
        throw error
      }
    },
    enabled: Boolean(sheetId),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: LOCAL_CACHE_AGE,
    refetchOnWindowFocus: false,
  })

  return {
    cards: query.data?.cards || emptyCards,
    tabMissing: query.data?.tabMissing || false,
    isLoading: query.isLoading,
    error: query.error,
  }
}

// Shared comparator so the Cards (summary) page and the payment-method
// picker always present cards in the same order. Primary source of truth
// is the user's Summary!G17:G list (passed in as `order`). Anything not
// listed there falls back to active-first, then alphabetical, so newly
// added cards still slot in predictably.
export function makeCardComparator(order: string[]) {
  const indexByName = new Map<string, number>()
  order.forEach((name, index) => {
    const key = name.trim().toLocaleLowerCase()
    if (key && !indexByName.has(key)) indexByName.set(key, index)
  })
  const positionOf = (name: string) => {
    const i = indexByName.get(name.trim().toLocaleLowerCase())
    return i === undefined ? Number.POSITIVE_INFINITY : i
  }
  return (a: CardRow, b: CardRow) => {
    const ai = positionOf(a.name)
    const bi = positionOf(b.name)
    if (ai !== bi) return ai - bi
    return Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  }
}

// Deprecated alias kept for backwards compatibility (no Summary order known).
export const compareCardsForDisplay = makeCardComparator([])
// The user keeps the canonical card list in the Summary tab, column G,
// starting at row 17. We treat that list as the source of truth for
// display ordering; if the tab/column is missing we silently fall back
// to the default comparator above.
export function useCardOrder() {
  const sheetId = useSheetId()
  // v2 cache key — previous version may have cached an empty list from a
  // transient API failure; bumping the key forces a fresh read.
  const cacheKey = `cardOrder.v2.${sheetId}`
  const cached = readLocalCache<string[]>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<string[]>({
    queryKey: ['cardOrder', 'v2', sheetId],
    queryFn: async () => {
      try {
        const values = (await getSheet(sheetId, 'Summary!G17:G')).values || []
        const order = values
          .map((row) => (row?.[0] ?? '').toString().trim())
          .filter(Boolean)
        // Only persist successful, non-empty reads — an empty result is
        // very likely a missing tab / wrong sheet, and caching it would
        // mask the issue on the next mount.
        if (order.length) writeLocalCache(cacheKey, order)
        return order
      } catch (error) {
        console.warn('[useCardOrder] could not read Summary!G17:G — falling back to default order', error)
        return []
      }
    },
    enabled: Boolean(sheetId),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: LOCAL_CACHE_AGE,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })
  return query.data || []
}

export function useCreateCardsTab() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: () => createCardsTab(sheetId),
    onSuccess: () => {
      clearLocalCache(`cards.${sheetId}`)
      queryClient.invalidateQueries({ queryKey: ['cards', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['sheetMeta', sheetId] })
    },
  })
}

export function useAddCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (card: CardSheetInput) => addCard(sheetId, card),
    onSuccess: () => { clearLocalCache(`cards.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }) },
  })
}

export function useUpdateCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (card: CardRow) => updateCard(sheetId, card),
    onSuccess: () => { clearLocalCache(`cards.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }) },
  })
}

export function useDeleteCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  const meta = useSheetMeta()
  return useMutation({
    mutationFn: async (card: CardRow) => {
      const sheetGid = (meta.data ?? (await getSheetMeta(sheetId))).sheets.find((sheet) => sheet.title === 'Cards')?.sheetId
      if (sheetGid === undefined) throw new Error('Could not find a Cards tab in this spreadsheet.')
      return deleteCard(sheetId, sheetGid, card.rowIndex)
    },
    onSuccess: () => { clearLocalCache(`cards.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }) },
  })
}
