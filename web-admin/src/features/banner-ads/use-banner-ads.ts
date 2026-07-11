import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { bannerAdListSchema } from '../../schemas/banner-ad'

const BANNER_ADS_KEY = ['banner-ads'] as const

export function useBannerAds() {
  return useQuery({
    queryKey: BANNER_ADS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/banner-ads')
      return bannerAdListSchema.parse(response.data).data ?? []
    },
  })
}

export interface CreateBannerAdInput {
  file: File
  vendorId?: string
  targetUrl?: string
  isPaid: boolean
  priceUsd?: number
  priority: number
  startsAt?: string
  endsAt?: string
}

// Shared FormData builder for create/update. On update the image file is
// optional (omitting it keeps the stored image); the datetime fields are
// sent as RFC3339 (the caller converts from the <input datetime-local>).
function toBannerAdForm(input: Omit<CreateBannerAdInput, 'file'> & { file?: File }): FormData {
  const form = new FormData()
  if (input.file) form.append('file', input.file)
  if (input.vendorId) form.append('vendor_id', input.vendorId)
  if (input.targetUrl) form.append('target_url', input.targetUrl)
  form.append('is_paid', String(input.isPaid))
  if (input.priceUsd != null) form.append('price_usd', String(input.priceUsd))
  form.append('priority', String(input.priority))
  if (input.startsAt) form.append('starts_at', input.startsAt)
  if (input.endsAt) form.append('ends_at', input.endsAt)
  return form
}

export function useCreateBannerAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateBannerAdInput) => {
      await apiClient.post('/admin/banner-ads', toBannerAdForm(input), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANNER_ADS_KEY })
    },
  })
}

export interface UpdateBannerAdInput {
  id: string
  file?: File
  vendorId?: string
  targetUrl?: string
  isPaid: boolean
  priceUsd?: number
  priority: number
  startsAt?: string
  endsAt?: string
}

export function useUpdateBannerAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateBannerAdInput) => {
      await apiClient.put(`/admin/banner-ads/${id}`, toBannerAdForm(rest), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANNER_ADS_KEY })
    },
  })
}

export function useSetBannerAdActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiClient.put(`/admin/banner-ads/${id}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANNER_ADS_KEY })
    },
  })
}

export function useDeleteBannerAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/banner-ads/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANNER_ADS_KEY })
    },
  })
}
