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

// POST /auth/verify-otp returns either a login payload (existing user) or a
// verification_token for complete-registration (new phone) — §9 step 2.
export const verifyOtpResponseSchema = z.object({
  status: z.string(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  user: authUserSchema.optional(),
  verification_token: z.string().optional(),
})

// complete-registration returns a full auth payload.
export const authResponseSchema = z.object({
  status: z.string(),
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
})

export type AuthUser = z.infer<typeof authUserSchema>
export type UserRole = z.infer<typeof userRoleSchema>
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>
