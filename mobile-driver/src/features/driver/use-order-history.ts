import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { orderListSchema } from '../../schemas/order'

// D5 History/Earnings (blueprint §11.D5): delivered+cancelled orders, most
// recent first (already sorted server-side).
export function useOrderHistory() {
  return useQuery({
    queryKey: ['driver-order-history'],
    queryFn: async () => {
      const response = await apiClient.get('/driver/orders/history')
      return orderListSchema.parse(response.data).data ?? []
    },
  })
}
