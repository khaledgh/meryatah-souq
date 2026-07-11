import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { orderListSchema } from '../../schemas/order'

export interface AdminOrderFilters {
  vendor_id?: string
  status?: string
  scheduled_only?: boolean
  placed_after?: string
  placed_before?: string
}

export function useAdminOrders(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: ['admin-orders', filters],
    queryFn: async () => {
      const response = await apiClient.get('/admin/orders', {
        params: { ...filters, scheduled_only: filters.scheduled_only ? 'true' : undefined },
      })
      return orderListSchema.parse(response.data).data ?? []
    },
  })
}
