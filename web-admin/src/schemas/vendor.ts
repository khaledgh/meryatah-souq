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
  commission_pct: z.number().nullable().optional(),
  display_currency: z.string().nullable().optional(),
  scheduling_allowed: z.boolean(),
  scheduling_enabled: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
})

export const vendorListSchema = z.object({
  data: z.array(vendorSchema),
})

export const vendorDetailSchema = z.object({
  data: vendorSchema,
})

export type Vendor = z.infer<typeof vendorSchema>

export function vendorDisplayName(vendor: Pick<Vendor, 'name_i18n'>, locale: string): string {
  return vendor.name_i18n[locale] ?? vendor.name_i18n['en'] ?? Object.values(vendor.name_i18n)[0] ?? ''
}
