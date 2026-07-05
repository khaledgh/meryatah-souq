import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { orderListSchema, orderDetailSchema } from '../../schemas/order'

export function useMyOrders() {
  return useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const response = await apiClient.get('/user/orders')
      return orderListSchema.parse(response.data).data
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

