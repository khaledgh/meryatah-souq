import { z } from 'zod'
import { nameI18nSchema } from './vendor'

export const productImageSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  storage_driver: z.string(),
  sort_order: z.number(),
  url: z.string().optional(),
})

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
  // Accept null off the wire (an older backend emits it for a product with
  // no images) but hand consumers a guaranteed array, so no screen has to
  // null-check before mapping.
  images: z
    .array(productImageSchema)
    .nullable()
    .transform((images) => images ?? []),
  display_currency: z.string(),
  display_price: z.number(),
})

export const productListSchema = z.object({
  data: z.array(productSchema).nullable(),
})

export const productDetailSchema = z.object({
  data: productSchema,
})

export const categorySchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  name_i18n: nameI18nSchema,
  sort_order: z.number(),
})

export const categoryListSchema = z.object({
  data: z.array(categorySchema).nullable(),
})

export type Product = z.infer<typeof productSchema>
export type ProductImage = z.infer<typeof productImageSchema>
export type Category = z.infer<typeof categorySchema>

export function productDisplayName(product: Pick<Product, 'name_i18n'>, locale: string): string {
  return product.name_i18n[locale] ?? product.name_i18n['en'] ?? Object.values(product.name_i18n)[0] ?? ''
}

export function productDisplayDescription(product: Pick<Product, 'description_i18n'>, locale: string): string {
  return product.description_i18n[locale] ?? product.description_i18n['en'] ?? Object.values(product.description_i18n)[0] ?? ''
}

export function categoryDisplayName(category: Pick<Category, 'name_i18n'>, locale: string): string {
  return category.name_i18n[locale] ?? category.name_i18n['en'] ?? Object.values(category.name_i18n)[0] ?? ''
}
