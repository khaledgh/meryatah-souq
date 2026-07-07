import { z } from 'zod'

export const storeCategorySchema = z.object({
  id: z.string(),
  name_i18n: z.record(z.string(), z.string()),
  slug: z.string(),
  template_kind: z.enum(['food', 'electronics', 'market', 'generic']),
  is_active: z.boolean(),
  icon_url: z.string().nullable().optional(),
})

export const storeCategoryListSchema = z.object({
  data: z.array(storeCategorySchema),
})

export type StoreCategory = z.infer<typeof storeCategorySchema>
