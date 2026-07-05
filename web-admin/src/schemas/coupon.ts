import { z } from 'zod'

export const couponSchema = z.object({
  id: z.string(),
  vendor_id: z.string().nullable().optional(),
  code: z.string(),
  discount_type: z.string(),
  discount_val: z.number(),
  max_redemptions: z.number().nullable().optional(),
  redeemed_count: z.number(),
  starts_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  is_active: z.boolean(),
})

export const couponListSchema = z.object({
  data: z.array(couponSchema),
})

export type Coupon = z.infer<typeof couponSchema>
