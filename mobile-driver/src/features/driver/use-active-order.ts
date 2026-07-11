import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { nullableOrderDetailSchema } from '../../schemas/order'

// D4 Active Order (blueprint §11.D4): GET /driver/orders/active returns
// `{ data: Order | null }` — null is the normal "no active delivery" state.
// Polled at a modest interval so status changes made elsewhere (e.g. a
// vendor cancelling) are picked up without a manual refresh.
const POLL_INTERVAL_MS = 10000

export function useActiveOrder() {
  return useQuery({
    queryKey: ['driver-active-order'],
    queryFn: async () => {
      const response = await apiClient.get('/driver/orders/active')
      return nullableOrderDetailSchema.parse(response.data).data
    },
    refetchInterval: POLL_INTERVAL_MS,
  })
}
