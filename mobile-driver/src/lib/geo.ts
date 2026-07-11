// Client-side haversine distance in kilometers — used by D3's incoming
// requests list to show "distance to pickup" so a driver can make an
// accept/decline decision before committing (blueprint §11.D3). Distance to
// the vendor/pickup point, not the delivery point, since that's what's
// relevant pre-accept (the driver doesn't detour to the customer first).
const EARTH_RADIUS_KM = 6371

export function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRad(to.latitude - from.latitude)
  const dLon = toRad(to.longitude - from.longitude)
  const lat1 = toRad(from.latitude)
  const lat2 = toRad(to.latitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
