import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { bannerAdListSchema } from '../../schemas/banner-ad'

// Fetches the active, in-schedule-window banner ads for the home carousel
// (public GET /api/v1/banner-ads, ordered by priority server-side).
export function useBannerAds() {
  return useQuery({
    queryKey: ['banner-ads'],
    queryFn: async () => {
      const response = await apiClient.get('/banner-ads')
      return bannerAdListSchema.parse(response.data).data ?? []
    },
  })
}
