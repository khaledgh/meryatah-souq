import { useMutation } from '@tanstack/react-query'
import { apiClient } from '../../lib/api-client'

export interface RateDriverInput {
  orderId: string
  score: number
  comment?: string
}

export function useRateDriver() {
  return useMutation({
    mutationFn: async ({ orderId, score, comment }: RateDriverInput) => {
      const response = await apiClient.post(`/user/orders/${orderId}/rating`, {
        score,
        comment,
      })
      return response.data
    },
  })
}
