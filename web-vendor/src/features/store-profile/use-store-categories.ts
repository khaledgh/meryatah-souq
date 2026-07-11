import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { storeCategoryListSchema } from '../../schemas/store-category'

// Public list of admin-managed store categories, used to populate the
// section picker on the store profile page — vendors choose from this list,
// they cannot type a free-text category anymore (§ marketplace taxonomy).
export function useStoreCategories() {
  return useQuery({
    queryKey: ['store-categories'],
    queryFn: async () => {
      const response = await apiClient.get('/store-categories')
      return storeCategoryListSchema.parse(response.data).data ?? []
    },
  })
}
