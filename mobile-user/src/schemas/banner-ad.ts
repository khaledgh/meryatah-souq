import { z } from 'zod'

// Mirrors the public banner ad payload from GET /api/v1/banner-ads
// (backend BannerAd; image_url is resolved server-side from the storage
// driver). Only the fields the carousel needs are modeled.
export const bannerAdSchema = z.object({
  id: z.string(),
  vendor_id: z.string().nullable().optional(),
  target_url: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
})

export const bannerAdListSchema = z.object({
  data: z.array(bannerAdSchema),
})

export type BannerAd = z.infer<typeof bannerAdSchema>
