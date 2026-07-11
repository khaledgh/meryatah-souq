import { z } from 'zod'

// Mirrors mobile-user's src/schemas/order.ts field-for-field (same backend
// Order shape, blueprint §11.D4) so a future shared-schema-package refactor
// is straightforward.
export const orderStatusSchema = z.enum([
  'pending',
  'accepted',
  'preparing',
  'on_the_way',
  'delivered',
  'cancelled',
])

export const orderItemSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  product_id: z.string(),
  name: z.string(),
  unit_price_usd: z.number(),
  quantity: z.number(),
})

export const orderSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  vendor_id: z.string(),
  driver_id: z.string().nullable().optional(),
  status: orderStatusSchema,
  subtotal_usd: z.number(),
  currency_code: z.string(),
  exchange_rate: z.number(),
  subtotal_display: z.number(),
  commission_pct: z.number(),
  commission_usd: z.number(),
  coupon_id: z.string().nullable().optional(),
  scheduled_for: z.string().nullable().optional(),
  placed_at: z.string(),
  delivered_at: z.string().nullable().optional(),
  delivery_longitude: z.number(),
  delivery_latitude: z.number(),
  // Only populated by GET /driver/orders/active (ActiveDriverOrder on the
  // backend, a join against vendors) — GET /driver/orders/history uses the
  // plain Order shape with no vendor join, so these stay optional here
  // rather than splitting into two schemas for one screen's extra fields.
  vendor_name: z.string().optional(),
  vendor_longitude: z.number().optional(),
  vendor_latitude: z.number().optional(),
  items: z.array(orderItemSchema).nullable().optional(),
})

// GET /driver/orders/active returns `{ "data": Order | null }` — null is a
// normal empty state (no active delivery), not an error.
export const nullableOrderDetailSchema = z.object({
  data: orderSchema.nullable(),
})

export const orderListSchema = z.object({
  data: z.array(orderSchema).nullable(),
})

export type Order = z.infer<typeof orderSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>

// Only the two transitions a driver may request (blueprint §11.D4) —
// vendor-only transitions are rejected server-side regardless.
export const driverOrderStatusSchema = z.enum(['on_the_way', 'delivered'])
export type DriverOrderStatus = z.infer<typeof driverOrderStatusSchema>
