import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { vendorDetailSchema, vendorListSchema, type Vendor } from '../../schemas/vendor'

const VENDORS_KEY = ['vendors'] as const

// Admin has no dedicated "list all vendors" endpoint yet (backend only
// exposes GET /vendors/:id and /vendors/nearby, both built for the public
// user-facing store discovery flow, not admin management). Nearby with a
// generous radius from a neutral point is the closest existing endpoint —
// flagged so a real ListAllVendors admin endpoint can replace this later.
export function useVendors() {
  return useQuery({
    queryKey: VENDORS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/vendors/nearby', {
        params: { lon: 35.5, lat: 33.9, radius_m: 20000000, limit: 100 },
      })
      return vendorListSchema.parse(response.data).data ?? []
    },
  })
}

export function useVendor(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const response = await apiClient.get(`/vendors/${String(vendorId)}`)
      return vendorDetailSchema.parse(response.data).data
    },
    enabled: vendorId !== undefined,
  })
}

interface CreateVendorInput {
  owner_user_id: string
  name_i18n: Record<string, string>
  category: string
  longitude: number
  latitude: number
  address?: string
  timezone?: string
}

export function useCreateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateVendorInput) => {
      const response = await apiClient.post('/admin/vendors', input)
      return vendorDetailSchema.parse(response.data).data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDORS_KEY })
    },
  })
}

export function useSetVendorActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, active }: { vendorId: string; active: boolean }) => {
      await apiClient.put(`/admin/vendors/${vendorId}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDORS_KEY })
    },
  })
}

export function useSetVendorCommission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, commissionPct }: { vendorId: string; commissionPct: number | null }) => {
      await apiClient.put(`/admin/vendors/${vendorId}/commission`, { commission_pct: commissionPct })
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['vendor', variables.vendorId] })
    },
  })
}

export function useGrantScheduling() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, allowed }: { vendorId: string; allowed: boolean }) => {
      await apiClient.put(`/admin/vendors/${vendorId}/scheduling-allowed`, { allowed })
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['vendor', variables.vendorId] })
    },
  })
}

export type { Vendor }
