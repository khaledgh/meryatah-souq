import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { storeCategoryListSchema, type TemplateKind } from '../../schemas/store-category'

const STORE_CATEGORIES_KEY = ['store-categories'] as const

export function useStoreCategories() {
  return useQuery({
    queryKey: STORE_CATEGORIES_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/store-categories')
      return storeCategoryListSchema.parse(response.data).data ?? []
    },
  })
}

interface StoreCategoryFormInput {
  nameI18n: Record<string, string>
  slug: string
  templateKind: TemplateKind
  accentColor?: string
  sortOrder: number
  file?: File
}

function toStoreCategoryForm(input: StoreCategoryFormInput): FormData {
  const form = new FormData()
  if (input.file) form.append('file', input.file)
  form.append('name_i18n', JSON.stringify(input.nameI18n))
  form.append('slug', input.slug)
  form.append('template_kind', input.templateKind)
  if (input.accentColor) form.append('accent_color', input.accentColor)
  form.append('sort_order', String(input.sortOrder))
  return form
}

export function useCreateStoreCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: StoreCategoryFormInput) => {
      await apiClient.post('/admin/store-categories', toStoreCategoryForm(input), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORE_CATEGORIES_KEY })
    },
  })
}

export function useUpdateStoreCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: StoreCategoryFormInput & { id: string }) => {
      await apiClient.put(`/admin/store-categories/${id}`, toStoreCategoryForm(rest), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORE_CATEGORIES_KEY })
    },
  })
}

export function useSetStoreCategoryActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiClient.put(`/admin/store-categories/${id}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORE_CATEGORIES_KEY })
    },
  })
}

export function useDeleteStoreCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/store-categories/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORE_CATEGORIES_KEY })
    },
  })
}
