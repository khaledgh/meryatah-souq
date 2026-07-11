import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { availableOrderListSchema } from '../../schemas/driver'

// D3 Incoming Requests (blueprint §11.D3): polled while online and the
// driver has no active order — the caller controls `enabled` so we never
// poll while offline or already on a delivery (they can't accept another).
const POLL_INTERVAL_MS = 7000

export function useAvailableOrders(enabled: boolean) {
  return useQuery({
    queryKey: ['driver-available-orders'],
    queryFn: async () => {
      const response = await apiClient.get('/driver/orders/available')
      return availableOrderListSchema.parse(response.data).data ?? []
    },
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
  })
}
