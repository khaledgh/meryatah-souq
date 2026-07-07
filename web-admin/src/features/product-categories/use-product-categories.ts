import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { productCategoryListSchema } from '../../schemas/product-category'

const PRODUCT_CATEGORIES_KEY = ['product-categories'] as const

export function useProductCategories() {
  return useQuery({
    queryKey: PRODUCT_CATEGORIES_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/product-categories')
      return productCategoryListSchema.parse(response.data).data
    },
  })
}

interface ProductCategoryFormInput {
  nameI18n: Record<string, string>
  slug: string
  parentId?: string
  storeCategoryId?: string
  sortOrder: number
  file?: File
}

function toProductCategoryForm(input: ProductCategoryFormInput): FormData {
  const form = new FormData()
  if (input.file) form.append('file', input.file)
  form.append('name_i18n', JSON.stringify(input.nameI18n))
  form.append('slug', input.slug)
  if (input.parentId) form.append('parent_id', input.parentId)
  if (input.storeCategoryId) form.append('store_category_id', input.storeCategoryId)
  form.append('sort_order', String(input.sortOrder))
  return form
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductCategoryFormInput) => {
      await apiClient.post('/admin/product-categories', toProductCategoryForm(input), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY })
    },
  })
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: ProductCategoryFormInput & { id: string }) => {
      await apiClient.put(`/admin/product-categories/${id}`, toProductCategoryForm(rest), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY })
    },
  })
}

export function useSetProductCategoryActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiClient.put(`/admin/product-categories/${id}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY })
    },
  })
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/product-categories/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY })
    },
  })
}
