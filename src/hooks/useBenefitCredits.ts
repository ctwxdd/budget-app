import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addBenefitCredit, createBenefitCreditsTab, getSheet, isRateLimitError, updateBenefitCredit, type BenefitCreditSheetInput } from '../lib/sheets'
import { parseBenefitCreditRows, type CardBenefitCredit } from '../lib/cardBenefits'
import { clearLocalCache, readLocalCache, writeLocalCache } from '../lib/localCache'
import { useSheetId } from './useExpenses'

type BenefitCreditsData = { credits: CardBenefitCredit[]; tabMissing: boolean }
const emptyCredits: CardBenefitCredit[] = []
const LOCAL_CACHE_AGE = 5 * 60 * 1000

function isMissingBenefitCreditsTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /BenefitCredits/i.test(message)
}

export function useBenefitCredits() {
  const sheetId = useSheetId()
  const cacheKey = `benefitCredits.${sheetId}`
  const cached = readLocalCache<BenefitCreditsData>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<BenefitCreditsData>({
    queryKey: ['benefitCredits', sheetId],
    queryFn: async () => {
      try {
        const data = { credits: parseBenefitCreditRows((await getSheet(sheetId, 'BenefitCredits!A2:F')).values || []), tabMissing: false }
        writeLocalCache(cacheKey, data)
        return data
      } catch (error) {
        if (isMissingBenefitCreditsTab(error)) return { credits: [], tabMissing: true }
        throw error
      }
    },
    enabled: Boolean(sheetId),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: LOCAL_CACHE_AGE,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isRateLimitError(error) ? failureCount < 2 : failureCount < 1,
  })

  return {
    credits: query.data?.credits || emptyCredits,
    tabMissing: query.data?.tabMissing || false,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useCreateBenefitCreditsTab() {
  const sheetId = useSheetId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createBenefitCreditsTab(sheetId),
    onSuccess: () => {
      clearLocalCache(`benefitCredits.${sheetId}`)
      queryClient.invalidateQueries({ queryKey: ['benefitCredits', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['sheetMeta', sheetId] })
    },
  })
}

export function useAddBenefitCredit() {
  const sheetId = useSheetId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credit: BenefitCreditSheetInput) => addBenefitCredit(sheetId, credit),
    onSuccess: (result, credit) => {
      clearLocalCache(`benefitCredits.${sheetId}`)
      queryClient.setQueryData<BenefitCreditsData>(['benefitCredits', sheetId], (old) => {
        const nextCredit = parseBenefitCreditRows([[
          credit.date,
          credit.card,
          credit.benefit,
          String(credit.amount),
          credit.status,
          credit.note,
        ]])[0]
        return nextCredit ? { credits: [...(old?.credits || []), { ...nextCredit, rowIndex: result.rowIndex }], tabMissing: false } : old
      })
      queryClient.invalidateQueries({ queryKey: ['benefitCredits', sheetId] })
    },
  })
}

export function useUpdateBenefitCredit() {
  const sheetId = useSheetId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ rowIndex, credit }: { rowIndex: number; credit: BenefitCreditSheetInput }) => updateBenefitCredit(sheetId, rowIndex, credit),
    onSuccess: (result, { credit }) => {
      clearLocalCache(`benefitCredits.${sheetId}`)
      queryClient.setQueryData<BenefitCreditsData>(['benefitCredits', sheetId], (old) => {
        const nextCredit = parseBenefitCreditRows([[
          credit.date,
          credit.card,
          credit.benefit,
          String(credit.amount),
          credit.status,
          credit.note,
        ]])[0]
        return nextCredit ? { credits: (old?.credits || []).map((item) => item.rowIndex === result.rowIndex ? { ...nextCredit, rowIndex: result.rowIndex } : item), tabMissing: false } : old
      })
      queryClient.invalidateQueries({ queryKey: ['benefitCredits', sheetId] })
    },
  })
}
