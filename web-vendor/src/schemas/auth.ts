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

// POST /auth/verify-otp returns one of two shapes (backend §9 step 2):
//  - status "login": existing account → tokens + user (the vendor path,
//    since vendor accounts are pre-created at admin approval).
//  - status "register_required": brand-new phone → a verification_token.
//    A vendor should never hit this; if they do it means no vendor account
//    exists for that phone.
export const verifyOtpResponseSchema = z.object({
  status: z.string(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  user: authUserSchema.optional(),
  verification_token: z.string().optional(),
})

// POST /auth/refresh always returns a full login payload (tokens + user).
export const authResponseSchema = z.object({
  status: z.string(),
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
})

export type AuthUser = z.infer<typeof authUserSchema>
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>
