import { z } from 'zod'

export const statusCountSchema = z.object({
  status: z.string(),
  count: z.number(),
})

export const dashboardSchema = z.object({
  today_orders: z.number(),
  today_revenue: z.number(),
  today_commission: z.number(),
  open_orders: z.number(),
  display_currency: z.string(),
  status_breakdown: z.array(statusCountSchema).nullable(),
  lifetime_delivered: z.number(),
})

export const dashboardResponseSchema = z.object({ data: dashboardSchema })

export const earningsRowSchema = z.object({
  day: z.string(),
  orders: z.number(),
  gross_usd: z.number(),
  commission_usd: z.number(),
  net_usd: z.number(),
  gross_display: z.number(),
  commission_display: z.number(),
  net_display: z.number(),
})

export const earningsReportSchema = z.object({
  display_currency: z.string(),
  rows: z.array(earningsRowSchema).nullable(),
  total_orders: z.number(),
  total_gross: z.number(),
  total_commission: z.number(),
  total_net: z.number(),
})

export const earningsResponseSchema = z.object({ data: earningsReportSchema })

export type Dashboard = z.infer<typeof dashboardSchema>
export type EarningsRow = z.infer<typeof earningsRowSchema>
export type EarningsReport = z.infer<typeof earningsReportSchema>
