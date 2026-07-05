import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { earningsResponseSchema, type EarningsReport } from '../../schemas/stats'

export function useEarnings(vendorId: string, days: number) {
  return useQuery({
    queryKey: ['vendor-earnings', vendorId, days],
    queryFn: async (): Promise<EarningsReport> => {
      const response = await apiClient.get(`/vendor/${vendorId}/earnings`, { params: { days } })
      return earningsResponseSchema.parse(response.data).data
    },
  })
}
