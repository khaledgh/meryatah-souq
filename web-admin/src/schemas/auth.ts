import { z } from 'zod'

export const userRoleSchema = z.enum(['user', 'vendor', 'driver', 'super_admin'])

export const authUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  role: userRoleSchema,
  preferred_locale: z.string().nullable().optional(),
})

export const authResponseSchema = z.object({
  status: z.string(),
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
})

export type AuthUser = z.infer<typeof authUserSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
