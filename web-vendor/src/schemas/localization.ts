import { z } from 'zod'

export const localeSchema = z.object({
  code: z.string(),
  name: z.string(),
  is_rtl: z.boolean(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number(),
})

export const localeListSchema = z.object({
  data: z.array(localeSchema).nullable(),
})

export const uiTranslationSchema = z.object({
  id: z.string(),
  locale: z.string(),
  namespace: z.string(),
  key: z.string(),
  value: z.string(),
})

export const uiTranslationListSchema = z.object({
  data: z.array(uiTranslationSchema).nullable(),
})

export const missingKeySchema = z.object({
  locale: z.string(),
  namespace: z.string(),
  key: z.string(),
})

export const missingKeyListSchema = z.object({
  data: z.array(missingKeySchema).nullable(),
})

// GET /api/v1/i18n/:locale returns ui_translations grouped by namespace:
// { "data": { "<namespace>": { "<key>": "<value>" } } }. Values are always
// strings; namespaces/keys are open-ended, so this is a nested record.
export const translationsResponseSchema = z.object({
  data: z.record(z.string(), z.record(z.string(), z.string())),
})

export type TranslationsByNamespace = z.infer<typeof translationsResponseSchema>['data']

export type Locale = z.infer<typeof localeSchema>
export type UITranslation = z.infer<typeof uiTranslationSchema>
export type MissingKeyEntry = z.infer<typeof missingKeySchema>
