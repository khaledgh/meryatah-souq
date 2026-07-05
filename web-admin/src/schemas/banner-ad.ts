import { z } from 'zod'

export const bannerAdSchema = z.object({
  id: z.string(),
  vendor_id: z.string().nullable().optional(),
  storage_driver: z.string(),
  target_url: z.string().nullable().optional(),
  is_paid: z.boolean(),
  price_usd: z.number().nullable().optional(),
  priority: z.number(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  is_active: z.boolean(),
  image_url: z.string().nullable().optional(),
})

export const bannerAdListSchema = z.object({
  data: z.array(bannerAdSchema),
})

export type BannerAd = z.infer<typeof bannerAdSchema>
