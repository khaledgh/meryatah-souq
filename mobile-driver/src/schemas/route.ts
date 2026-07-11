import { z } from 'zod'

// GET /api/v1/route — the road geometry + ETA from the backend's OSRM proxy.
// Coordinates are GeoJSON order: [longitude, latitude]. Do NOT swap them;
// MapLibre consumes GeoJSON directly.
export const routeSchema = z.object({
  geometry: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  duration_seconds: z.number(),
  distance_meters: z.number(),
})

export const routeResponseSchema = z.object({
  data: routeSchema,
})

export type Route = z.infer<typeof routeSchema>
