import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'

// D3 accept action (blueprint §11.D3: "first-accept wins; concurrency-safe"
// — a 409 ORDER_ALREADY_ASSIGNED from a losing race is expected and normal,
// not a bug; the caller surfaces toApiError's user_message and refetches).
export function useAcceptOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      await apiClient.post(`/driver/orders/${orderId}/accept`)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['driver-available-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['driver-active-order'] })
    },
  })
}
