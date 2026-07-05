import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { couponListSchema, type Coupon } from '../../schemas/coupon'

const couponsKey = (vendorId: string) => ['vendor-coupons', vendorId] as const

export function useCoupons(vendorId: string) {
  return useQuery({
    queryKey: couponsKey(vendorId),
    queryFn: async (): Promise<Coupon[]> => {
      const response = await apiClient.get(`/vendor/${vendorId}/coupons`)
      return couponListSchema.parse(response.data).data ?? []
    },
  })
}

export interface CreateCouponInput {
  code: string
  discount_type: string
  discount_val: number
  max_redemptions?: number
  expires_at?: string
}

export function useCreateCoupon(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCouponInput) => {
      await apiClient.post(`/vendor/${vendorId}/coupons`, input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponsKey(vendorId) })
    },
  })
}

export function useSetCouponActive(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ couponId, active }: { couponId: string; active: boolean }) => {
      await apiClient.put(`/vendor/${vendorId}/coupons/${couponId}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponsKey(vendorId) })
    },
  })
}
