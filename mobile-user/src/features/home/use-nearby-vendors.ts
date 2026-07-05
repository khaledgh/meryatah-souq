import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { openStatusSchema, vendorListSchema, type OpenStatus, type Vendor } from '../../schemas/vendor'

export interface Coordinates {
  longitude: number
  latitude: number
}

export interface VendorWithStatus extends Vendor {
  openStatus: OpenStatus | null
}

// Fetches nearby active vendors (PostGIS) and each one's live Open/Closed
// status. The status calls run in parallel; a failed status resolves to null
// so one vendor's error never blanks the whole list (blueprint §11.C5:
// closed stores stay visible, ordering is gated elsewhere).
export function useNearbyVendors(coords: Coordinates) {
  return useQuery({
    queryKey: ['nearby-vendors', coords.longitude, coords.latitude],
    queryFn: async (): Promise<VendorWithStatus[]> => {
      const response = await apiClient.get('/vendors/nearby', {
        params: { lon: coords.longitude, lat: coords.latitude, radius_m: 20000, limit: 50 },
      })
      const vendors = vendorListSchema.parse(response.data).data ?? []

      return Promise.all(
        vendors.map(async (vendor): Promise<VendorWithStatus> => {
          try {
            const statusRes = await apiClient.get(`/vendors/${vendor.id}/open-status`)
            return { ...vendor, openStatus: openStatusSchema.parse(statusRes.data).data }
          } catch {
            return { ...vendor, openStatus: null }
          }
        }),
      )
    },
  })
}
