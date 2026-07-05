import { z } from 'zod'

import { nameI18nSchema } from './vendor'

export const categorySchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  name_i18n: nameI18nSchema,
  sort_order: z.number(),
})

export const categoryListSchema = z.object({
  data: z.array(categorySchema).nullable(),
})

export const categoryDetailSchema = z.object({
  data: categorySchema,
})

export const productImageSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  sort_order: z.number(),
  url: z.string().optional(),
})

// List/Get return ProductWithDisplay: the product plus resolved image URLs,
// the vendor's display currency, and price_usd converted (display_price).
// Create returns a bare product without those derived fields, so images /
// display_currency / display_price are optional and defaulted here — a
// single schema covers both responses without a runtime parse failure on
// the create path.
export const productSchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  category_id: z.string().nullable().optional(),
  name_i18n: nameI18nSchema,
  description_i18n: nameI18nSchema,
  price_usd: z.number(),
  stock: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  images: z.array(productImageSchema).nullable().optional(),
  display_currency: z.string().default('USD'),
  display_price: z.number().optional(),
})

export const productListSchema = z.object({
  data: z.array(productSchema).nullable(),
})

export const productDetailSchema = z.object({
  data: productSchema,
})

export type Category = z.infer<typeof categorySchema>
export type ProductImage = z.infer<typeof productImageSchema>
export type Product = z.infer<typeof productSchema>
