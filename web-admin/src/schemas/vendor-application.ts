import { z } from 'zod'

export const vendorApplicationStatusSchema = z.enum(['pending', 'approved', 'rejected'])

export const vendorApplicationSchema = z.object({
  id: z.string(),
  status: vendorApplicationStatusSchema,
  business_name_i18n: z.record(z.string(), z.string()),
  category: z.string(),
  contact_phone: z.string(),
  contact_first_name: z.string(),
  contact_last_name: z.string(),
  address: z.string().nullable().optional(),
  timezone: z.string(),
  notes: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  created_vendor_id: z.string().nullable().optional(),
  created_user_id: z.string().nullable().optional(),
  submitted_at: z.string(),
  longitude: z.number(),
  latitude: z.number(),
})

export const vendorApplicationListSchema = z.object({
  data: z.array(vendorApplicationSchema).nullable(),
})

export type VendorApplicationStatus = z.infer<typeof vendorApplicationStatusSchema>
export type VendorApplication = z.infer<typeof vendorApplicationSchema>
