import { z } from 'zod'

// GET /driver/orders/available — a lighter projection than Order (blueprint
// §11.D3), matching services.AvailableOrder in
// backend/internal/services/order_status_service.go exactly.
export const availableOrderSchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  vendor_name: z.string(),
  vendor_longitude: z.number(),
  vendor_latitude: z.number(),
  delivery_longitude: z.number(),
  delivery_latitude: z.number(),
  subtotal_usd: z.number(),
  placed_at: z.string(),
  // Geodesic metres from the driver's last known position to the pickup,
  // computed server-side (PostGIS ST_Distance). 0 when the server had no
  // recorded position for the driver — the client falls back to its own
  // haversine in that case rather than showing "0 km away".
  pickup_distance_meters: z.number(),
})

export const availableOrderListSchema = z.object({
  data: z.array(availableOrderSchema),
})

export type AvailableOrder = z.infer<typeof availableOrderSchema>

// GET /driver/ratings — models.Rating in backend/internal/models/marketing.go.
export const ratingSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  driver_id: z.string(),
  user_id: z.string(),
  score: z.number(),
  comment: z.string().nullable().optional(),
  created_at: z.string(),
})

export const ratingListSchema = z.object({
  data: z.array(ratingSchema).nullable(),
})

export type Rating = z.infer<typeof ratingSchema>
