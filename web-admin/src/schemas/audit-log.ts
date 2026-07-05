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
  data: z.array(auditLogSchema),
  total: z.number(),
})

export type AuditLogEntry = z.infer<typeof auditLogSchema>
