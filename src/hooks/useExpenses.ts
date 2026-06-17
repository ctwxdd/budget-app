import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, SHEET_ID_KEY } from '../lib/defaults'
import { expenseToRow, parseExpenseRows } from '../lib/parse'
import { appendRow, batchUpdateExpenseFields, deleteRow, deleteRows, getSheet, getSheetMeta, insertRow, isRateLimitError, updateRow } from '../lib/sheets'
import { clearLocalCache, readLocalCache, writeLocalCache } from '../lib/localCache'
import { rememberSheet } from '../lib/recentSheets'
import type { Expense } from '../lib/types'
import { categoryName } from '../lib/format'

const LOCAL_CACHE_AGE = 5 * 60 * 1000
const expensesCacheKey = (sheetId: string) => `expenses.${sheetId}`
const giftcardsCacheKey = (sheetId: string) => `giftcards.${sheetId}`

export function getStoredSheetId() {
  return localStorage.getItem(SHEET_ID_KEY) || ''
}

export function useSheetId() {
  return getStoredSheetId()
}

export function useSheetMeta() {
  const sheetId = useSheetId()
  const query = useQuery({ queryKey: ['sheetMeta', sheetId], queryFn: () => getSheetMeta(sheetId), enabled: Boolean(sheetId), staleTime: 1000 * 60 * 10 })
  React.useEffect(() => {
    if (sheetId && query.data?.title) rememberSheet(sheetId, query.data.title)
  }, [sheetId, query.data?.title])
  return query
}

export function useExpenses() {
  const sheetId = useSheetId()
  const cached = React.useMemo(() => readLocalCache<Expense[]>(expensesCacheKey(sheetId), LOCAL_CACHE_AGE), [sheetId])
  return useQuery({
    queryKey: ['expenses', sheetId],
    queryFn: async () => {
      const expenses = parseExpenseRows((await getSheet(sheetId, 'Expense!A2:F')).values || [])
      writeLocalCache(expensesCacheKey(sheetId), expenses)
      return expenses
    },
    enabled: Boolean(sheetId),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: LOCAL_CACHE_AGE,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isRateLimitError(error) ? failureCount < 2 : failureCount < 1,
    retryDelay: (attempt, error) => isRateLimitError(error) ? Math.min(4000, 1200 * (attempt + 1)) : 1000,
  })
}

export function useAddExpense() {
  const queryClient = useQueryClient()
  const sheetId = useSheetId()
  return useMutation({
    mutationFn: async (expense: Omit<Expense, 'rowIndex'>) => {
      const current = parseExpenseRows((await getSheet(sheetId, 'Expense!A2:F')).values || [])
      const insertBefore = current.find((item) => item.date > expense.date)
      if (!insertBefore) return appendRow(sheetId, 'Expense!A:F', expenseToRow(expense))
      const sheetGid = (await getSheetMeta(sheetId)).sheets.find((sheet) => sheet.title === 'Expense')?.sheetId
      if (sheetGid === undefined) throw new Error('Could not find an Expense tab in this spreadsheet.')
      await insertRow(sheetId, sheetGid, insertBefore.rowIndex - 1)
      return updateRow(sheetId, `Expense!A${insertBefore.rowIndex}:F${insertBefore.rowIndex}`, expenseToRow(expense))
    },
    onMutate: async (expense) => {
      const queryKey = ['expenses', sheetId]
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Expense[]>(queryKey)
      const optimisticRowIndex = -Date.now()
      const optimistic: Expense = { ...expense, rowIndex: optimisticRowIndex }
      queryClient.setQueryData<Expense[]>(queryKey, (old) => {
        const next = [...(old || [])]
        const index = next.findIndex((item) => item.date > expense.date)
        if (index === -1) next.push(optimistic)
        else next.splice(index, 0, optimistic)
        return next
      })
      return { previous }
    },
    onError: (_error, _expense, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(['expenses', sheetId], context.previous)
    },
    onSettled: () => {
      clearLocalCache(expensesCacheKey(sheetId), giftcardsCacheKey(sheetId))
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
    onMutate: async (expense) => {
      const queryKey = ['expenses', sheetId]
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Expense[]>(queryKey)
      queryClient.setQueryData<Expense[]>(queryKey, (old) => (old || []).map((item) => item.rowIndex === expense.rowIndex ? expense : item))
      return { previous }
    },
    onError: (_error, _expense, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(['expenses', sheetId], context.previous)
    },
    onSettled: () => {
      clearLocalCache(expensesCacheKey(sheetId), giftcardsCacheKey(sheetId))
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
      clearLocalCache(expensesCacheKey(sheetId), giftcardsCacheKey(sheetId))
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
      clearLocalCache(expensesCacheKey(sheetId), giftcardsCacheKey(sheetId))
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
      clearLocalCache(expensesCacheKey(sheetId), giftcardsCacheKey(sheetId))
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
  return React.useMemo(() => mergeUnique(DEFAULT_CATEGORIES, expenses.data?.map((expense) => categoryName(expense.category)) || []), [expenses.data])
}

export function usePaymentMethods() {
  const expenses = useExpenses()
  return React.useMemo(() => mergeUnique(DEFAULT_PAYMENT_METHODS, expenses.data?.map((expense) => expense.paymentMethod) || []), [expenses.data])
}
