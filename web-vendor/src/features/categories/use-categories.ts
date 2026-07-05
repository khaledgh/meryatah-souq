import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { categoryListSchema, type Category } from '../../schemas/catalog'

const categoriesKey = (vendorId: string) => ['vendor-categories', vendorId] as const

export function useCategories(vendorId: string) {
  return useQuery({
    queryKey: categoriesKey(vendorId),
    queryFn: async (): Promise<Category[]> => {
      const response = await apiClient.get(`/vendors/${vendorId}/categories`)
      return categoryListSchema.parse(response.data).data ?? []
    },
  })
}

export interface CreateCategoryInput {
  name_i18n: Record<string, string>
  sort_order: number
}

export function useCreateCategory(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      await apiClient.post(`/vendor/${vendorId}/categories`, input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesKey(vendorId) })
    },
  })
}

export interface UpdateCategoryInput {
  categoryId: string
  name_i18n?: Record<string, string>
  sort_order?: number
}

export function useUpdateCategory(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, ...body }: UpdateCategoryInput) => {
      await apiClient.patch(`/vendor/${vendorId}/categories/${categoryId}`, body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesKey(vendorId) })
    },
  })
}

export function useDeleteCategory(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      await apiClient.delete(`/vendor/${vendorId}/categories/${categoryId}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesKey(vendorId) })
    },
  })
}
