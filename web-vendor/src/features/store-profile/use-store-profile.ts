import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { vendorDetailSchema, type Vendor } from '../../schemas/vendor'

export interface UpdateProfileInput {
  vendorId: string
  name_i18n?: Record<string, string>
  category?: string
  store_category_id?: string
  address?: string
  timezone?: string
  display_currency?: string
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, ...body }: UpdateProfileInput): Promise<Vendor> => {
      const response = await apiClient.patch(`/vendor/${vendorId}/profile`, body)
      return vendorDetailSchema.parse(response.data).data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vendor-me'] })
    },
  })
}
