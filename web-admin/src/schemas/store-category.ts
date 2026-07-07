import { z } from 'zod'

export const templateKindSchema = z.enum(['food', 'electronics', 'market', 'generic'])

export const storeCategorySchema = z.object({
  id: z.string(),
  name_i18n: z.record(z.string(), z.string()),
  slug: z.string(),
  template_kind: templateKindSchema,
  accent_color: z.string().nullable().optional(),
  sort_order: z.number(),
  is_active: z.boolean(),
  icon_url: z.string().nullable().optional(),
})

export const storeCategoryListSchema = z.object({
  data: z.array(storeCategorySchema),
})

export type TemplateKind = z.infer<typeof templateKindSchema>
export type StoreCategory = z.infer<typeof storeCategorySchema>
