import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { routeResponseSchema } from '../../schemas/route'

interface Point {
  longitude: number
  latitude: number
}

// Fetches the driving route between two points from the backend's routing
// proxy (which fronts a self-hosted OSRM). Returns the road geometry to draw
// and the duration used for the ETA.
//
// Disabled until both endpoints are known — a route to nowhere is not a
// request worth making. The road between two fixed points doesn't change
// minute to minute (and the backend caches it in Redis anyway), so this is
// cached aggressively rather than refetched on every focus.
export function useRoute(from: Point | null | undefined, to: Point | null | undefined) {
  return useQuery({
    queryKey: ['route', from?.longitude, from?.latitude, to?.longitude, to?.latitude],
    enabled: from != null && to != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!from || !to) {
        throw new Error('route: missing endpoints')
      }
      const response = await apiClient.get('/route', {
        params: {
          from_lon: from.longitude,
          from_lat: from.latitude,
          to_lon: to.longitude,
          to_lat: to.latitude,
        },
      })
      return routeResponseSchema.parse(response.data).data
    },
  })
}

// formatEta turns OSRM's duration in seconds into a short human string.
export function formatEta(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`
}
