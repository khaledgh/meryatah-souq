import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { categoryRequestListSchema, type CategoryRequestStatus } from '../../schemas/category-request'

const CATEGORY_REQUESTS_KEY = ['category-requests'] as const

export function useCategoryRequests(status: CategoryRequestStatus = 'pending') {
  return useQuery({
    queryKey: [...CATEGORY_REQUESTS_KEY, status],
    queryFn: async () => {
      const response = await apiClient.get('/admin/category-requests', { params: { status } })
      return categoryRequestListSchema.parse(response.data).data ?? []
    },
  })
}

export function useApproveCategoryRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiClient.post(`/admin/category-requests/${requestId}/approve`)
      return response.data as { data: { created_category_id?: string } }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORY_REQUESTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['store-categories'] })
      void queryClient.invalidateQueries({ queryKey: ['product-categories'] })
    },
  })
}

export function useRejectCategoryRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      await apiClient.post(`/admin/category-requests/${requestId}/reject`, { reason })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORY_REQUESTS_KEY })
    },
  })
}
