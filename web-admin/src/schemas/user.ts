import { z } from 'zod'

import { userRoleSchema } from './auth'

export const adminUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  role: userRoleSchema,
  is_active: z.boolean(),
  phone_verified: z.boolean(),
  created_at: z.string(),
})

export const adminUserListSchema = z.object({
  data: z.array(adminUserSchema),
})

export type AdminUser = z.infer<typeof adminUserSchema>

export function userDisplayName(user: Pick<AdminUser, 'first_name' | 'last_name' | 'phone'>): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return name || user.phone
}
