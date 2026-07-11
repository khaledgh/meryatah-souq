import * as Location from 'expo-location'
import { useEffect, useState } from 'react'

export interface Coordinates {
  longitude: number
  latitude: number
}

// Beirut. Used only when the device's location is unknown — permission
// denied, or the fix hasn't landed yet — so "stores near you" still shows
// something plausible instead of an empty list or a spinner that never ends.
export const FALLBACK_LOCATION: Coordinates = { longitude: 35.5018, latitude: 33.8938 }

interface UserLocation {
  location: Coordinates
  /** False while the real fix is still pending, or if it was denied. */
  isPrecise: boolean
}

// The device's current position, for "nearby stores" ranking. Every screen
// that ranks by proximity previously hardcoded Beirut; this replaces that so
// the results actually reflect where the user is.
//
// Deliberately non-blocking: it returns the fallback immediately and swaps in
// the real fix when it arrives, so nothing waits on a GPS lock. A denied
// permission is a normal outcome, not an error — the user simply keeps seeing
// the fallback ranking.
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<Coordinates>(FALLBACK_LOCATION)
  const [isPrecise, setIsPrecise] = useState(false)

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted' || !active) return

        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!active) return

        setLocation({ longitude: fix.coords.longitude, latitude: fix.coords.latitude })
        setIsPrecise(true)
      } catch {
        // No fix available (GPS off, indoors, emulator without a location set)
        // — keep the fallback.
      }
    })()

    return () => {
      active = false
    }
  }, [])

  return { location, isPrecise }
}
