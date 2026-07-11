import { useEffect, useRef } from 'react'

import { useAuth } from '../auth/auth-context'
import { useActiveOrder } from '../driver/use-active-order'
import { startBackgroundTracking, stopBackgroundTracking } from './location-task'

// Owns the background-location task's lifecycle for the whole app.
//
// This deliberately does NOT live on the Active Order screen. The task has to
// outlive that screen — the driver switches tabs, backgrounds the app, locks
// the phone, and the customer must still see them moving — so a screen-scoped
// effect can only ever start it, never reliably stop it. Anything that ends a
// delivery while the screen is unmounted (most importantly: the VENDOR
// CANCELS while the driver is en route) would otherwise leave the task
// reporting an off-shift driver's location indefinitely.
//
// Mounted once in the root layout, it watches the single source of truth —
// the polled active order — and starts/stops from that:
//
//   status == on_the_way          -> tracking on
//   anything else, incl. null     -> tracking off
//
// which covers delivered, cancelled, unassigned, and "order vanished", with
// no per-screen bookkeeping. Logout stops it separately (auth-context), since
// there is no active-order poll left to observe once the session is gone.
export function TrackingController() {
  const { isAuthenticated } = useAuth()
  const { data: order, isLoading } = useActiveOrder()
  const isTrackingRef = useRef(false)

  const shouldTrack = isAuthenticated && order?.status === 'on_the_way'

  useEffect(() => {
    // Don't touch the task before the first poll resolves: `order` is
    // undefined while loading, which would otherwise read as "no delivery"
    // and tear down the foreground service on every app resume, dropping
    // location updates and flickering the Android notification.
    if (isLoading) return

    if (shouldTrack && !isTrackingRef.current) {
      isTrackingRef.current = true
      void startBackgroundTracking().then((started) => {
        // Permission denied — reflected on the Active Order screen, which
        // asks for it again in context.
        isTrackingRef.current = started
      })
      return
    }

    if (!shouldTrack && isTrackingRef.current) {
      isTrackingRef.current = false
      void stopBackgroundTracking()
    }
  }, [shouldTrack, isLoading])

  return null
}
