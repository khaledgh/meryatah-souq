import { z } from 'zod'

export const orderStatusSchema = z.enum(['pending', 'accepted', 'preparing', 'on_the_way', 'delivered', 'cancelled'])

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
  subtotal_display: z.number(),
  currency_code: z.string(),
  commission_usd: z.number(),
  scheduled_for: z.string().nullable().optional(),
  placed_at: z.string(),
  delivered_at: z.string().nullable().optional(),
  delivery_longitude: z.number().nullable().optional(),
  delivery_latitude: z.number().nullable().optional(),
  items: z.array(orderItemSchema).nullable().optional(),
})

export const orderListSchema = z.object({
  data: z.array(orderSchema).nullable(),
})

export type Order = z.infer<typeof orderSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>

// Mirrors the backend's validTransitions (order_status_service.go). Kept in
// sync so the UI only offers legal next-statuses; the backend re-validates,
// so this is a UX convenience, never the enforcement point.
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
