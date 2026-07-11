import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiClient } from '../../lib/api-client'
import { vendorApplicationListSchema, type VendorApplicationStatus } from '../../schemas/vendor-application'

const VENDOR_APPLICATIONS_KEY = ['vendor-applications'] as const

const approveResponseSchema = z.object({ data: z.object({ id: z.string() }) })

export function useVendorApplications(status: VendorApplicationStatus = 'pending') {
  return useQuery({
    queryKey: [...VENDOR_APPLICATIONS_KEY, status],
    queryFn: async () => {
      const response = await apiClient.get('/admin/vendor-applications', { params: { status } })
      return vendorApplicationListSchema.parse(response.data).data ?? []
    },
  })
}

export function useApproveVendorApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const response = await apiClient.post(`/admin/vendor-applications/${applicationId}/approve`)
      return approveResponseSchema.parse(response.data).data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDOR_APPLICATIONS_KEY })
    },
  })
}

export function useRejectVendorApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason: string }) => {
      await apiClient.post(`/admin/vendor-applications/${applicationId}/reject`, { reason })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDOR_APPLICATIONS_KEY })
    },
  })
}
