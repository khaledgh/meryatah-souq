import { z } from 'zod'

// Mirrors the backend's standardized error contract (blueprint §4.2):
// { "error": { "code", "status", "developer_message", "user_message" } }
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    status: z.number(),
    developer_message: z.string(),
    user_message: z.string(),
  }),
})

export type ApiError = z.infer<typeof apiErrorSchema>
