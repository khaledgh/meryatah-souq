import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { settingsSnapshotSchema } from '../../schemas/settings'

const SETTINGS_KEY = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/settings')
      return settingsSnapshotSchema.parse(response.data).data
    },
  })
}

export function useSetAppConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      await apiClient.put(`/admin/config/${key}`, { value })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

export function useSetFeatureFlag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, enabled, config }: { key: string; enabled: boolean; config?: unknown }) => {
      await apiClient.put(`/admin/feature-flags/${key}`, { enabled, config: config ?? {} })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
