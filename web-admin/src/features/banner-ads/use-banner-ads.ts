import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { bannerAdListSchema } from '../../schemas/banner-ad'

const BANNER_ADS_KEY = ['banner-ads'] as const

export function useBannerAds() {
  return useQuery({
    queryKey: BANNER_ADS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/banner-ads')
      return bannerAdListSchema.parse(response.data).data
    },
  })
}

export interface CreateBannerAdInput {
  file: File
  vendorId?: string
  targetUrl?: string
  isPaid: boolean
  priority: number
  startsAt?: string
  endsAt?: string
}

export function useCreateBannerAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateBannerAdInput) => {
      const form = new FormData()
      form.append('file', input.file)
      if (input.vendorId) form.append('vendor_id', input.vendorId)
      if (input.targetUrl) form.append('target_url', input.targetUrl)
      form.append('is_paid', String(input.isPaid))
      form.append('priority', String(input.priority))
      if (input.startsAt) form.append('starts_at', input.startsAt)
      if (input.endsAt) form.append('ends_at', input.endsAt)
      await apiClient.post('/admin/banner-ads', form, {
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
