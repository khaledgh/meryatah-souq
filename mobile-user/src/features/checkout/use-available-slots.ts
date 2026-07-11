import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/api-client'
import { slotListSchema } from '../../schemas/order'

export function useAvailableSlots(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['available-slots', vendorId],
    queryFn: async () => {
      const response = await apiClient.get(`/vendors/${String(vendorId)}/scheduling/slots`)
      return slotListSchema.parse(response.data).data ?? []
    },
    enabled: !!vendorId,
  })
}
