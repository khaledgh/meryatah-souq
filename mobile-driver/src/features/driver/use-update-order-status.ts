import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import type { DriverOrderStatus } from '../../schemas/order'

// D4 status actions (blueprint §11.D4): "Start Delivery" (on_the_way) and
// "Mark Delivered" (delivered) are the only two transitions a driver may
// request — the server rejects anything else regardless of what's sent.
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: DriverOrderStatus }) => {
      await apiClient.put(`/driver/orders/${orderId}/status`, { status })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['driver-active-order'] })
      void queryClient.invalidateQueries({ queryKey: ['driver-order-history'] })
    },
  })
}
