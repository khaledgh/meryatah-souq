import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiClient } from '../../lib/api-client'

// GET /orders/:orderId/driver-location — the driver's LAST KNOWN position.
// `data` is null when no driver is assigned yet, or when one is but has never
// reported a fix. Both are normal states, not errors.
const driverLocationResponseSchema = z.object({
  data: z
    .object({
      longitude: z.number(),
      latitude: z.number(),
      heading: z.number(),
    })
    .nullable(),
})

// Seeds the tracking map with the driver's last known position so it renders
// a marker immediately, rather than showing an empty map until the first
// WebSocket frame arrives — which can be several seconds away, and never
// arrives at all if the driver's app is currently backgrounded between fixes.
// Live movement still comes over the socket; this is just the starting point.
export function useDriverLocation(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['driver-location', orderId],
    enabled: enabled && !!orderId,
    queryFn: async () => {
      const response = await apiClient.get(`/orders/${String(orderId)}/driver-location`)
      return driverLocationResponseSchema.parse(response.data).data
    },
  })
}
