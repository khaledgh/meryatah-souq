import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { dashboardResponseSchema, type Dashboard } from '../../schemas/stats'

export function useDashboard(vendorId: string) {
  return useQuery({
    queryKey: ['vendor-dashboard', vendorId],
    queryFn: async (): Promise<Dashboard> => {
      const response = await apiClient.get(`/vendor/${vendorId}/dashboard`)
      return dashboardResponseSchema.parse(response.data).data
    },
  })
}
