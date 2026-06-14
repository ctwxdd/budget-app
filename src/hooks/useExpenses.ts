import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, SHEET_ID_KEY } from '../lib/defaults'
import { expenseToRow, parseExpenseRows } from '../lib/parse'
import { appendRow, batchUpdateExpenseFields, deleteRow, deleteRows, getSheet, getSheetMeta, updateRow } from '../lib/sheets'
import type { Expense } from '../lib/types'

export function getStoredSheetId() {
  return localStorage.getItem(SHEET_ID_KEY) || ''
}

export function useSheetId() {
  return getStoredSheetId()
}

export function useSheetMeta() {
  const sheetId = useSheetId()
  return useQuery({ queryKey: ['sheetMeta', sheetId], queryFn: () => getSheetMeta(sheetId), enabled: Boolean(sheetId), staleTime: 1000 * 60 * 10 })
}

export function useExpenses() {
  const sheetId = useSheetId()
  return useQuery({
    queryKey: ['expenses', sheetId],
    queryFn: async () => parseExpenseRows((await getSheet(sheetId, 'Expense!A2:F')).values || []),
    enabled: Boolean(sheetId),
  })
}

export function useAddExpense() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (expense: Omit<Expense, 'rowIndex'>) => appendRow(sheetId, 'Expense!A:F', expenseToRow(expense)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['giftcards', sheetId] })
    },
  })
}

export function useUpdateExpense() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (expense: Expense) => updateRow(sheetId, `Expense!A${expense.rowIndex}:F${expense.rowIndex}`, expenseToRow(expense)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['giftcards', sheetId] })
    },
  })
}

export function useDeleteExpense() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  const meta = useSheetMeta()
  return useMutation({
    mutationFn: async (expense: Expense) => {
      const sheetGid = (meta.data ?? (await getSheetMeta(sheetId))).sheets.find((sheet) => sheet.title === 'Expense')?.sheetId
      if (sheetGid === undefined) throw new Error('Could not find an Expense tab in this spreadsheet.')
      return deleteRow(sheetId, sheetGid, expense.rowIndex - 1)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['giftcards', sheetId] })
    },
  })
}

export function useBatchDeleteExpenses() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  const meta = useSheetMeta()
  return useMutation({
    mutationFn: async (expenses: Expense[]) => {
      const sheetGid = (meta.data ?? (await getSheetMeta(sheetId))).sheets.find((sheet) => sheet.title === 'Expense')?.sheetId
      if (sheetGid === undefined) throw new Error('Could not find an Expense tab in this spreadsheet.')
      return deleteRows(sheetId, sheetGid, expenses.map((expense) => expense.rowIndex))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['giftcards', sheetId] })
    },
  })
}

export function useBatchUpdateExpenses() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: (updates: Array<{ rowIndex: number; updates: Partial<Pick<Expense, 'date' | 'amount' | 'description' | 'category' | 'paymentMethod' | 'reimbursement'>> }>) =>
      batchUpdateExpenseFields(sheetId, 'Expense', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['giftcards', sheetId] })
    },
  })
}

function mergeUnique(defaults: string[], values: string[]) {
  return Array.from(new Set([...defaults, ...values.filter(Boolean)])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function useCategories() {
  const expenses = useExpenses()
  return mergeUnique(DEFAULT_CATEGORIES, expenses.data?.map((expense) => expense.category) || [])
}

export function usePaymentMethods() {
  const expenses = useExpenses()
  return mergeUnique(DEFAULT_PAYMENT_METHODS, expenses.data?.map((expense) => expense.paymentMethod) || [])
}
