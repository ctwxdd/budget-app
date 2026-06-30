import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addCardBenefit, getSheet, isRateLimitError, type CardBenefitSheetInput } from '../lib/sheets'
import { parseCardBenefitRows, type CardBenefit } from '../lib/cardBenefits'
import { clearLocalCache, readLocalCache, writeLocalCache } from '../lib/localCache'
import { useSheetId } from './useExpenses'

type CardBenefitsData = { benefits: CardBenefit[]; tabMissing: boolean }
const emptyBenefits: CardBenefit[] = []
const LOCAL_CACHE_AGE = 5 * 60 * 1000

function isMissingCardBenefitsTab(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /Unable to parse range|Cannot find range|not found/i.test(message) && /CardBenefits/i.test(message)
}

export function useCardBenefits() {
  const sheetId = useSheetId()
  const cacheKey = `cardBenefits.${sheetId}`
  const cached = readLocalCache<CardBenefitsData>(cacheKey, LOCAL_CACHE_AGE)
  const query = useQuery<CardBenefitsData>({
    queryKey: ['cardBenefits', sheetId],
    queryFn: async () => {
      try {
        const data = { benefits: parseCardBenefitRows((await getSheet(sheetId, 'CardBenefits!A2:I')).values || []), tabMissing: false }
        writeLocalCache(cacheKey, data)
        return data
      } catch (error) {
        if (isMissingCardBenefitsTab(error)) return { benefits: [], tabMissing: true }
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
    benefits: query.data?.benefits || emptyBenefits,
    tabMissing: query.data?.tabMissing || false,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useAddCardBenefit() {
  const sheetId = useSheetId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (benefit: CardBenefitSheetInput) => addCardBenefit(sheetId, benefit),
    onSuccess: (result, benefit) => {
      clearLocalCache(`cardBenefits.${sheetId}`)
      queryClient.setQueryData<CardBenefitsData>(['cardBenefits', sheetId], (old) => {
        const nextBenefit = parseCardBenefitRows([[
          benefit.card,
          benefit.benefit,
          String(benefit.amount),
          benefit.period,
          benefit.category,
          benefit.matcher,
          benefit.startDate,
          benefit.endDate,
          String(benefit.active),
        ]])[0]
        return nextBenefit ? { benefits: [...(old?.benefits || []), { ...nextBenefit, rowIndex: result.rowIndex }], tabMissing: false } : old
      })
      queryClient.invalidateQueries({ queryKey: ['cardBenefits', sheetId] })
    },
  })
}
