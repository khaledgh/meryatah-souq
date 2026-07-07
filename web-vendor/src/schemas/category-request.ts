import { z } from 'zod'

export const categoryRequestStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export const categoryRequestKindSchema = z.enum(['store', 'product'])

export const categoryRequestSchema = z.object({
  id: z.string(),
  status: categoryRequestStatusSchema,
  kind: categoryRequestKindSchema,
  name_i18n: z.record(z.string(), z.string()),
  parent_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
  submitted_at: z.string(),
})

export const categoryRequestListSchema = z.object({
  data: z.array(categoryRequestSchema),
})

export type CategoryRequestStatus = z.infer<typeof categoryRequestStatusSchema>
export type CategoryRequestKind = z.infer<typeof categoryRequestKindSchema>
export type CategoryRequest = z.infer<typeof categoryRequestSchema>
