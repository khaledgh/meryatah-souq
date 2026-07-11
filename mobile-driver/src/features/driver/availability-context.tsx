import * as Location from 'expo-location'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { apiClient, toApiError } from '../../lib/api-client'

export interface DriverCoords {
  longitude: number
  latitude: number
  heading: number | null
}

interface AvailabilityContextValue {
  isOnline: boolean
  isToggling: boolean
  location: DriverCoords | null
  permissionDenied: boolean
  error: string | null
  goOnline: () => Promise<boolean>
  goOffline: () => Promise<void>
}

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null)

// D2 Availability (blueprint §11.D2): the online/offline toggle also gates
// foreground location streaming — going online requests permission and
// starts a watch; going offline stops it immediately. This context is the
// single source of truth for "am I online" and "where am I right now" so
// D3 (distance-to-pickup) and D4 (WS location producer) both read the same
// live position instead of each requesting their own location watch.
export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [location, setLocation] = useState<DriverCoords | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null)

  const stopWatch = useCallback(() => {
    subscriptionRef.current?.remove()
    subscriptionRef.current = null
  }, [])

  const startWatch = useCallback(async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      setPermissionDenied(true)
      return false
    }
    setPermissionDenied(false)

    const initial = await Location.getCurrentPositionAsync({})
    setLocation({
      longitude: initial.coords.longitude,
      latitude: initial.coords.latitude,
      heading: initial.coords.heading,
    })

    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 },
      (update) => {
        setLocation({
          longitude: update.coords.longitude,
          latitude: update.coords.latitude,
          heading: update.coords.heading,
        })
      },
    )
    return true
  }, [])

  const goOnline = useCallback(async (): Promise<boolean> => {
    setIsToggling(true)
    setError(null)
    try {
      const granted = await startWatch()
      if (!granted) {
        setIsToggling(false)
        return false
      }
      await apiClient.put('/driver/availability', { is_online: true })
      setIsOnline(true)
      return true
    } catch (err) {
      stopWatch()
      setError(toApiError(err).user_message)
      return false
    } finally {
      setIsToggling(false)
    }
  }, [startWatch, stopWatch])

  const goOffline = useCallback(async () => {
    setIsToggling(true)
    setError(null)
    try {
      await apiClient.put('/driver/availability', { is_online: false })
    } catch (err) {
      setError(toApiError(err).user_message)
    } finally {
      stopWatch()
      setIsOnline(false)
      setIsToggling(false)
    }
  }, [stopWatch])

  useEffect(() => stopWatch, [stopWatch])

  const value = useMemo<AvailabilityContextValue>(
    () => ({ isOnline, isToggling, location, permissionDenied, error, goOnline, goOffline }),
    [isOnline, isToggling, location, permissionDenied, error, goOnline, goOffline],
  )

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>
}

export function useAvailability(): AvailabilityContextValue {
  const ctx = useContext(AvailabilityContext)
  if (!ctx) {
    throw new Error('useAvailability must be used within an AvailabilityProvider')
  }
  return ctx
}
