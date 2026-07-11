import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { ratingListSchema } from '../../schemas/driver'

// D5 History/Earnings ratings summary (blueprint §11.D5): GET
// /driver/ratings returns the driver's received ratings.
export function useRatings() {
  return useQuery({
    queryKey: ['driver-ratings'],
    queryFn: async () => {
      const response = await apiClient.get('/driver/ratings')
      return ratingListSchema.parse(response.data).data ?? []
    },
  })
}
