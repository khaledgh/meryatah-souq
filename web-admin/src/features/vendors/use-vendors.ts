import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { vendorDetailSchema, vendorListSchema, type Vendor } from '../../schemas/vendor'

const VENDORS_KEY = ['vendors'] as const

// Every vendor, active or not, wherever it is.
//
// This used to call the PUBLIC /vendors/nearby endpoint, which filters
// `is_active = true` and by geographic radius — so deactivating a vendor made
// it vanish from the very page that could re-activate it. Admin management
// views must never inherit the customer-facing discovery filters.
export function useVendors() {
  return useQuery({
    queryKey: VENDORS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/vendors')
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

// Moves a vendor on the map. Hits the admin PATCH route, which reuses the same
// service the vendor owner's own profile edit does — so a super_admin can fix
// any vendor's position (including one that was created with none).
export function useSetVendorLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      vendorId,
      longitude,
      latitude,
      address,
    }: {
      vendorId: string
      longitude: number
      latitude: number
      address?: string
    }) => {
      const response = await apiClient.patch(`/admin/vendors/${vendorId}`, {
        longitude,
        latitude,
        ...(address !== undefined ? { address } : {}),
      })
      return vendorDetailSchema.parse(response.data).data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['vendor', variables.vendorId] })
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
