import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface Coordinates {
  longitude: number
  latitude: number
}

export interface DeliveryLocation extends Coordinates {
  /** Human-readable address, when we have one (reverse-geocoded). */
  address?: string
}

// Beirut. Used only until we know better — permission denied, or the GPS fix
// hasn't landed yet — so "stores near you" shows something plausible rather
// than an empty list or a spinner that never ends.
export const FALLBACK_LOCATION: DeliveryLocation = {
  longitude: 35.5018,
  latitude: 33.8938,
}

const STORAGE_KEY = 'meryata_user_delivery_location'

interface DeliveryLocationContextValue {
  location: DeliveryLocation
  /** False while we're still on the fallback (no GPS fix, no saved choice). */
  isResolved: boolean
  /** Set explicitly by the user via the map picker. Persisted. */
  setLocation: (next: DeliveryLocation) => Promise<void>
}

const DeliveryLocationContext = createContext<DeliveryLocationContextValue | null>(null)

// The delivery location the whole app ranks stores by and delivers to.
//
// Previously this was a GPS-only hook, and the home screen's location pill was
// a dead Pressable showing a hardcoded "Beirut, Lebanon" — so the app claimed
// a location it wasn't actually using, and the user had no way to change it.
//
// Resolution order:
//   1. A location the user explicitly picked (persisted — survives restarts)
//   2. The device's GPS fix
//   3. Beirut, so the app is never empty
export function DeliveryLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<DeliveryLocation>(FALLBACK_LOCATION)
  const [isResolved, setIsResolved] = useState(false)

  useEffect(() => {
    let active = true

    void (async () => {
      // A location the user chose themselves always wins over GPS — they may
      // be ordering to somewhere they aren't currently standing (home, work,
      // a friend's place), which is the entire point of picking one.
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY)
        if (saved && active) {
          const parsed: unknown = JSON.parse(saved)
          if (isDeliveryLocation(parsed)) {
            setLocationState(parsed)
            setIsResolved(true)
            return
          }
        }
      } catch {
        // Corrupt/unreadable entry — fall through to GPS.
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted' || !active) return

        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (!active) return

        const coords: DeliveryLocation = {
          longitude: fix.coords.longitude,
          latitude: fix.coords.latitude,
        }
        setLocationState({ ...coords, address: await describe(coords) })
        setIsResolved(true)
      } catch {
        // No fix (GPS off, indoors, emulator with no location set) — keep the
        // fallback. A denied permission is a normal outcome, not an error.
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const setLocation = useCallback(async (next: DeliveryLocation) => {
    // Fill in the address if the caller didn't supply one, so the home pill
    // always has something better than raw coordinates to show.
    const resolved: DeliveryLocation = next.address
      ? next
      : { ...next, address: await describe(next) }

    setLocationState(resolved)
    setIsResolved(true)
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(resolved))
    } catch {
      // Persisting is best-effort: failing to save must not stop the user
      // from using the location they just picked for this session.
    }
  }, [])

  const value = useMemo<DeliveryLocationContextValue>(
    () => ({ location, isResolved, setLocation }),
    [location, isResolved, setLocation],
  )

  return (
    <DeliveryLocationContext.Provider value={value}>{children}</DeliveryLocationContext.Provider>
  )
}

export function useDeliveryLocation(): DeliveryLocationContextValue {
  const ctx = useContext(DeliveryLocationContext)
  if (!ctx) {
    throw new Error('useDeliveryLocation must be used within a DeliveryLocationProvider')
  }
  return ctx
}

// describe reverse-geocodes a point into a short label ("Hamra, Beirut").
// Best-effort: the coordinates are what actually matter, so a failed lookup
// just means the UI shows coordinates instead of a name.
async function describe(coords: Coordinates): Promise<string | undefined> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coords)
    if (!place) return undefined
    const label = [place.district ?? place.name ?? place.street, place.city ?? place.region]
      .filter(Boolean)
      .join(', ')
    return label || undefined
  } catch {
    return undefined
  }
}

function isDeliveryLocation(value: unknown): value is DeliveryLocation {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['longitude'] === 'number' && typeof v['latitude'] === 'number'
}
