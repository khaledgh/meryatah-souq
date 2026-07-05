import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { productDetailSchema, productListSchema, type Product } from '../../schemas/catalog'

const productsKey = (vendorId: string) => ['vendor-products', vendorId] as const
const productKey = (productId: string) => ['vendor-product', productId] as const

export function useProducts(vendorId: string) {
  return useQuery({
    queryKey: productsKey(vendorId),
    queryFn: async (): Promise<Product[]> => {
      const response = await apiClient.get(`/vendors/${vendorId}/products`)
      return productListSchema.parse(response.data).data ?? []
    },
  })
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: productKey(productId ?? ''),
    enabled: Boolean(productId),
    queryFn: async (): Promise<Product> => {
      const response = await apiClient.get(`/products/${productId ?? ''}`)
      return productDetailSchema.parse(response.data).data
    },
  })
}

export interface ProductInput {
  category_id?: string | null
  name_i18n: Record<string, string>
  description_i18n: Record<string, string>
  price_usd: number
  stock: number
}

export function useCreateProduct(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductInput): Promise<Product> => {
      const response = await apiClient.post(`/vendor/${vendorId}/products`, input)
      return productDetailSchema.parse(response.data).data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsKey(vendorId) })
    },
  })
}

export interface UpdateProductInput extends Partial<ProductInput> {
  productId: string
  is_active?: boolean
}

export function useUpdateProduct(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, ...body }: UpdateProductInput) => {
      await apiClient.patch(`/vendor/${vendorId}/products/${productId}`, body)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: productsKey(vendorId) })
      void queryClient.invalidateQueries({ queryKey: productKey(variables.productId) })
    },
  })
}

export function useDeleteProduct(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      await apiClient.delete(`/vendor/${vendorId}/products/${productId}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsKey(vendorId) })
    },
  })
}

export function useAddProductImage(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, file }: { productId: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      await apiClient.post(`/vendor/${vendorId}/products/${productId}/images`, form)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: productKey(variables.productId) })
    },
  })
}

export function useRemoveProductImage(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, imageId }: { productId: string; imageId: string }) => {
      await apiClient.delete(`/vendor/${vendorId}/products/${productId}/images/${imageId}`)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: productKey(variables.productId) })
    },
  })
}
