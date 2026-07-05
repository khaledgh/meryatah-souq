import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { orderListSchema, type Order, type OrderStatus } from '../../schemas/order'

const ordersKey = (vendorId: string) => ['vendor-orders', vendorId] as const

// status omitted → all orders; otherwise server-side filtered by status.
export function useVendorOrders(vendorId: string, status?: OrderStatus) {
  return useQuery({
    queryKey: [...ordersKey(vendorId), status ?? 'all'],
    queryFn: async (): Promise<Order[]> => {
      const response = await apiClient.get(`/vendor/${vendorId}/orders`, {
        params: status ? { status } : undefined,
      })
      return orderListSchema.parse(response.data).data ?? []
    },
  })
}

export function useUpdateOrderStatus(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      await apiClient.put(`/vendor/${vendorId}/orders/${orderId}/status`, { status })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKey(vendorId) })
    },
  })
}
