import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { storeCategoryListSchema } from '../../schemas/store-category'

// Public list of admin-managed marketplace sections (Food, Electronics,
// Market, ...), sorted by sort_order — drives the home screen's section
// tiles and the per-category templating (blueprint marketplace taxonomy).
export function useStoreCategories() {
  return useQuery({
    queryKey: ['store-categories'],
    queryFn: async () => {
      const response = await apiClient.get('/store-categories')
      return storeCategoryListSchema.parse(response.data).data
    },
  })
}
