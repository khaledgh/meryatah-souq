import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { orderListSchema, orderDetailSchema } from '../../schemas/order'

export function useMyOrders() {
  return useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const response = await apiClient.get('/user/orders')
      const orders = orderListSchema.parse(response.data).data
      // Newest first — the API returns rows in an unspecified order, so sort
      // by placed_at descending for a stable, expected order history.
      return [...orders].sort(
        (a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime(),
      )
    },
  })
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const response = await apiClient.get(`/user/orders/${String(orderId)}`)
      return orderDetailSchema.parse(response.data).data
    },
    enabled: !!orderId,
  })
}

