import { z } from 'zod'

export const nameI18nSchema = z.record(z.string(), z.string())

export const vendorSchema = z.object({
  id: z.string(),
  owner_user_id: z.string(),
  name_i18n: nameI18nSchema,
  category: z.string(),
  address: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  timezone: z.string(),
  display_currency: z.string().nullable().optional(),
  scheduling_allowed: z.boolean(),
  scheduling_enabled: z.boolean(),
  is_active: z.boolean(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  distance_meters: z.number().nullable().optional(),
})

export const vendorListSchema = z.object({
  data: z.array(vendorSchema).nullable(),
})

export const vendorDetailSchema = z.object({
  data: vendorSchema,
})

// GET /vendors/:id/open-status — the Go OpenStatus struct has no json tags,
// so keys are capitalized (IsOpen / NextOpenAt / CheckedAtTZ).
export const openStatusSchema = z.object({
  data: z.object({
    IsOpen: z.boolean(),
    NextOpenAt: z.string().nullable().optional(),
    CheckedAtTZ: z.string(),
  }),
})

export type Vendor = z.infer<typeof vendorSchema>
export type OpenStatus = z.infer<typeof openStatusSchema>['data']

export function vendorDisplayName(vendor: Pick<Vendor, 'name_i18n'>, locale: string): string {
  return vendor.name_i18n[locale] ?? vendor.name_i18n['en'] ?? Object.values(vendor.name_i18n)[0] ?? ''
}
