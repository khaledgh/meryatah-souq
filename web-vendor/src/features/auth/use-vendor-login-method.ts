import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiClient } from '../../lib/api-client'

const responseSchema = z.object({ method: z.enum(['otp', 'password']) })

export type VendorLoginMethod = 'otp' | 'password'

// Reads the admin-configured vendor login method from the public endpoint so
// the login page shows the right form. Defaults to 'otp' on any failure so a
// transient error never blocks sign-in with the historical default.
export function useVendorLoginMethod(): VendorLoginMethod {
  const { data } = useQuery({
    queryKey: ['vendor-login-method'],
    queryFn: async (): Promise<VendorLoginMethod> => {
      const response = await apiClient.get('/auth/vendor-login-method')
      return responseSchema.parse(response.data).method
    },
    staleTime: 5 * 60 * 1000,
  })
  return data ?? 'otp'
}
