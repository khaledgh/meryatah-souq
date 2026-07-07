import { z } from 'zod'

export const productCategorySchema = z.object({
  id: z.string(),
  name_i18n: z.record(z.string(), z.string()),
  slug: z.string(),
  parent_id: z.string().nullable().optional(),
  store_category_id: z.string().nullable().optional(),
  sort_order: z.number(),
  is_active: z.boolean(),
  icon_url: z.string().nullable().optional(),
})

export const productCategoryListSchema = z.object({
  data: z.array(productCategorySchema),
})

export type ProductCategory = z.infer<typeof productCategorySchema>
