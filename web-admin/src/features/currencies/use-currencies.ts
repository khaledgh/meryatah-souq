import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { currencyListSchema } from '../../schemas/currency'

const CURRENCIES_KEY = ['currencies'] as const

export function useCurrencies() {
  return useQuery({
    queryKey: CURRENCIES_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/currencies')
      return currencyListSchema.parse(response.data).data
    },
  })
}

export function useCreateCurrency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { code: string; symbol: string; name: string; decimals: number }) => {
      await apiClient.post('/admin/currencies', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY })
    },
  })
}

export function useSetExchangeRate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, rate }: { code: string; rate: number }) => {
      await apiClient.put(`/admin/exchange-rates/${code}`, { rate })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY })
    },
  })
}

export function useSetCurrencyActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => {
      await apiClient.put(`/admin/currencies/${code}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY })
    },
  })
}
