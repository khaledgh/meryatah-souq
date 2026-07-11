import { z } from 'zod'

export const auditLogSchema = z.object({
  id: z.string(),
  actor_id: z.string().nullable().optional(),
  actor_role: z.string().nullable().optional(),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  created_at: z.string(),
})

export const auditLogPageSchema = z.object({
  // Accept null off the wire (an older backend emits it when a filter matches
  // nothing) but hand consumers a guaranteed array — the page reads
  // data.data.length directly, which would throw on null.
  data: z
    .array(auditLogSchema)
    .nullable()
    .transform((rows) => rows ?? []),
  total: z.number(),
})

export type AuditLogEntry = z.infer<typeof auditLogSchema>
