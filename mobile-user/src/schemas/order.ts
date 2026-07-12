import { z } from 'zod'

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
  // Frontend helpers
  vendor_name: z.string().optional(),
  items: z.array(orderItemSchema).nullable().optional(),
  driver_name: z.string().optional(),
})

export const orderListSchema = z.object({
  data: z.array(orderSchema).nullable(),
})

export const orderDetailSchema = z.object({
  data: orderSchema,
})

export type Order = z.infer<typeof orderSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const slotSchema = z.object({
  start_at: z.string(),
  end_at: z.string(),
  remaining_capacity: z.number(),
})

export const slotListSchema = z.object({
  data: z.array(slotSchema).nullable(),
})

export type Slot = z.infer<typeof slotSchema>

