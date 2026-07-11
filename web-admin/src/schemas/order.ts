import { z } from 'zod'

export const orderStatusSchema = z.enum(['pending', 'accepted', 'preparing', 'on_the_way', 'delivered', 'cancelled'])

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
})

export const orderListSchema = z.object({
  data: z.array(orderSchema).nullable(),
})

export type Order = z.infer<typeof orderSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const orderStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'on_the_way', 'delivered', 'cancelled']
