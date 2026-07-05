import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { couponListSchema } from '../../schemas/coupon'

const COUPONS_KEY = ['coupons'] as const

export function useCoupons() {
  return useQuery({
    queryKey: COUPONS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/coupons')
      return couponListSchema.parse(response.data).data
    },
  })
}

export interface CreateCouponInput {
  vendor_id?: string
  code: string
  discount_type: string
  discount_val: number
  max_redemptions?: number
  expires_at?: string
}

export function useCreateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCouponInput) => {
      await apiClient.post('/admin/coupons', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUPONS_KEY })
    },
  })
}

export function useSetCouponActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ couponId, active }: { couponId: string; active: boolean }) => {
      await apiClient.put(`/admin/coupons/${couponId}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUPONS_KEY })
    },
  })
}
