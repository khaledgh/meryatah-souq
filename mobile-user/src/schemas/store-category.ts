import { z } from 'zod'

export const templateKindSchema = z.enum(['food', 'electronics', 'market', 'generic'])

export const storeCategorySchema = z.object({
  id: z.string(),
  name_i18n: z.record(z.string(), z.string()),
  slug: z.string(),
  template_kind: templateKindSchema,
  accent_color: z.string().nullable().optional(),
  sort_order: z.number(),
  icon_url: z.string().nullable().optional(),
})

export const storeCategoryListSchema = z.object({
  data: z.array(storeCategorySchema).nullable(),
})

export type TemplateKind = z.infer<typeof templateKindSchema>
export type StoreCategory = z.infer<typeof storeCategorySchema>

export function storeCategoryDisplayName(category: Pick<StoreCategory, 'name_i18n'>, locale: string): string {
  return category.name_i18n[locale] ?? category.name_i18n['en'] ?? Object.values(category.name_i18n)[0] ?? ''
}
