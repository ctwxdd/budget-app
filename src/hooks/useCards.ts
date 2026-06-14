import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addCard, createCardsTab, deleteCard, getSheet, getSheetMeta, updateCard, type CardSheetInput } from '../lib/sheets'
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
  const query = useQuery<CardsData>({
    queryKey: ['cards', sheetId],
    queryFn: async () => {
      try {
        return { cards: parseCards((await getSheet(sheetId, 'Cards!A2:E1000')).values || []), tabMissing: false }
      } catch (error) {
        if (isMissingCardsTab(error)) return { cards: [], tabMissing: true }
        throw error
      }
    },
    enabled: Boolean(sheetId),
  })

  return {
    cards: query.data?.cards || emptyCards,
    tabMissing: query.data?.tabMissing || false,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useCreateCardsTab() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: () => createCardsTab(sheetId),
    onSuccess: () => {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }),
  })
}

export function useUpdateCard() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (card: CardRow) => updateCard(sheetId, card),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards', sheetId] }),
  })
}
