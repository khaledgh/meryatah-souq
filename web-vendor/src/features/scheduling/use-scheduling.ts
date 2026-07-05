import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'

export function useSetSchedulingEnabled(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiClient.put(`/vendor/${vendorId}/scheduling-enabled`, { enabled })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vendor-me'] })
    },
  })
}
