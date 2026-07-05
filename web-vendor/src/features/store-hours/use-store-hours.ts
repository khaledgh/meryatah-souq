import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import {
  vendorHourListSchema,
  vendorHourOverrideListSchema,
  type VendorHour,
  type VendorHourOverride,
} from '../../schemas/hours'

const hoursKey = (vendorId: string) => ['vendor-hours', vendorId] as const
const overridesKey = (vendorId: string) => ['vendor-hour-overrides', vendorId] as const

export function useWeeklyHours(vendorId: string) {
  return useQuery({
    queryKey: hoursKey(vendorId),
    queryFn: async (): Promise<VendorHour[]> => {
      const response = await apiClient.get(`/vendors/${vendorId}/hours`)
      return vendorHourListSchema.parse(response.data).data ?? []
    },
  })
}

export function useSetWeeklyHours(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (hours: VendorHour[]) => {
      await apiClient.put(`/vendor/${vendorId}/hours`, {
        hours: hours.map((h) => ({
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: h.is_closed,
        })),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hoursKey(vendorId) })
    },
  })
}

export function useOverrides(vendorId: string) {
  return useQuery({
    queryKey: overridesKey(vendorId),
    queryFn: async (): Promise<VendorHourOverride[]> => {
      const response = await apiClient.get(`/vendor/${vendorId}/hours/overrides`)
      return vendorHourOverrideListSchema.parse(response.data).data ?? []
    },
  })
}

export interface UpsertOverrideInput {
  date: string
  is_closed: boolean
  open_time?: string
  close_time?: string
  note?: string
}

export function useUpsertOverride(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertOverrideInput) => {
      await apiClient.post(`/vendor/${vendorId}/hours/overrides`, input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: overridesKey(vendorId) })
    },
  })
}

export function useDeleteOverride(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (overrideId: string) => {
      await apiClient.delete(`/vendor/${vendorId}/hours/overrides/${overrideId}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: overridesKey(vendorId) })
    },
  })
}
