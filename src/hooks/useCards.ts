import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
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
  annualFee: number
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

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value ?? '').trim().replace(/[$,\s]/g, '')
  if (!text) return 0
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}

function isMissingCardsTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /Cards/i.test(message)
}

function parseCards(rows: string[][] = []): CardRow[] {
  return rows
    .map((row, index) => {
      const [name = '', issuer = '', last4 = '', active = '', note = '', annualFee = ''] = row
      return {
        rowIndex: index + 2,
        name: String(name || '').trim(),
        issuer: String(issuer || '').trim(),
        last4: String(last4 || '').trim(),
        active: parseBoolean(active, true),
        note: String(note || '').trim(),
        annualFee: parseNumber(annualFee),
      }
    })
    .filter((card) => card.name || card.issuer || card.last4 || card.note)
}

export function useCards() {
  const sheetId = useSheetId()
  const cacheKey = `cards.v2.${sheetId}`
  const cached = readLocalCache<CardsData>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<CardsData>({
    queryKey: ['cards', 'v2', sheetId],
    queryFn: async () => {
      try {
        const data = { cards: parseCards((await getSheet(sheetId, 'Cards!A2:F1000')).values || []), tabMissing: false }
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

// The Cards tab itself is the source of truth for display order — sheet
// row order = picker order = Cards page order. This hook is kept as a
// thin derived view so call sites stay simple.
export function useCardOrder(): string[] {
  const { cards } = useCards()
  return React.useMemo(() => cards.map((card) => card.name).filter(Boolean), [cards])
}

export function useCreateCardsTab() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: () => createCardsTab(sheetId),
    onSuccess: () => {
      clearLocalCache(`cards.v2.${sheetId}`)
      queryClient.invalidateQueries({ queryKey: ['cards', 'v2', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['sheetMeta', sheetId] })
    },
  })
}

export function useAddCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (card: CardSheetInput) => addCard(sheetId, card),
    onSuccess: () => { clearLocalCache(`cards.v2.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', 'v2', sheetId] }) },
  })
}

export function useUpdateCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (card: CardRow) => updateCard(sheetId, card),
    onSuccess: () => { clearLocalCache(`cards.v2.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', 'v2', sheetId] }) },
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
    onSuccess: () => { clearLocalCache(`cards.v2.${sheetId}`); queryClient.invalidateQueries({ queryKey: ['cards', 'v2', sheetId] }) },
  })
}
