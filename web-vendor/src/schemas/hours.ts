import { z } from 'zod'

// open_time/close_time are Postgres TIME columns serialized as "HH:MM:SS".
export const vendorHourSchema = z.object({
  id: z.string().optional(),
  vendor_id: z.string().optional(),
  day_of_week: z.number(),
  open_time: z.string(),
  close_time: z.string(),
  is_closed: z.boolean(),
})

export const vendorHourListSchema = z.object({
  data: z.array(vendorHourSchema).nullable(),
})

export const vendorHourOverrideSchema = z.object({
  id: z.string(),
  vendor_id: z.string().optional(),
  date: z.string(),
  is_closed: z.boolean(),
  open_time: z.string().nullable().optional(),
  close_time: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
})

export const vendorHourOverrideListSchema = z.object({
  data: z.array(vendorHourOverrideSchema).nullable(),
})

export type VendorHour = z.infer<typeof vendorHourSchema>
export type VendorHourOverride = z.infer<typeof vendorHourOverrideSchema>
