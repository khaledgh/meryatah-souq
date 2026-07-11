import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { categoryRequestListSchema, type CategoryRequestKind } from '../../schemas/category-request'

const categoryRequestsKey = (vendorId: string) => ['vendor-category-requests', vendorId] as const

export function useCategoryRequests(vendorId: string) {
  return useQuery({
    queryKey: categoryRequestsKey(vendorId),
    queryFn: async () => {
      const response = await apiClient.get(`/vendor/${vendorId}/category-requests`)
      return categoryRequestListSchema.parse(response.data).data ?? []
    },
  })
}

export interface SubmitCategoryRequestInput {
  kind: CategoryRequestKind
  name_i18n: Record<string, string>
  parent_id?: string
  notes?: string
}

export function useSubmitCategoryRequest(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SubmitCategoryRequestInput) => {
      await apiClient.post(`/vendor/${vendorId}/category-requests`, input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryRequestsKey(vendorId) })
    },
  })
}
