import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../lib/api-client'

export interface PlaceOrderInput {
  vendor_id: string
  items: Array<{
    product_id: string
    quantity: number
  }>
  delivery_longitude: number
  delivery_latitude: number
  scheduled_for?: string // RFC3339 datetime
  currency_code?: string
  coupon_code?: string
}

export function usePlaceOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (input: PlaceOrderInput) => {
      // Generate a simple unique idempotency key using current time + random string
      const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      
      const response = await apiClient.post('/user/orders', input, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      })
      return response.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] })
    },
  })
}
