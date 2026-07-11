import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

import { apiClient } from '../../lib/api-client'

export const LOCATION_TASK = 'meryata-driver-location'

// Background location tracking (blueprint §11.D4 live tracking).
//
// Why this exists at all: the in-app WebSocket (use-location-stream.ts) dies
// with the React tree the moment the driver backgrounds the app or locks the
// screen — which froze the customer's tracking map exactly when it matters
// most. A TaskManager task keeps running headlessly, but it has NO React
// context and NO socket, so it reports over plain HTTP instead and the server
// broadcasts into the order room on its behalf (POST /driver/location).
//
// The task must be defined at module top level, not inside a component: the
// OS may relaunch the app headlessly to deliver a location, and the task has
// to already be registered when that happens.
//
// Note there is no order ID here — the server resolves the driver's active
// order from their own session, so a driver can never publish into someone
// else's tracking room.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return
  }
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] }
  const latest = locations?.at(-1)
  if (!latest) {
    return
  }

  try {
    await apiClient.post('/driver/location', {
      longitude: latest.coords.longitude,
      latitude: latest.coords.latitude,
      heading: latest.coords.heading ?? 0,
    })
  } catch {
    // Offline, or the access token expired and could not be refreshed. Drop
    // this fix rather than retrying: positions are superseded every few
    // seconds, so a stale one is worth less than the battery a retry costs.
    // apiClient's 401 interceptor already handles the token-refresh case,
    // including on a headless cold start where the in-memory access token is
    // empty but the refresh token is still in the keychain.
  }
})

// startBackgroundTracking begins reporting the driver's position, including
// while the app is backgrounded. Safe to call when already started.
//
// Requires BOTH foreground and background permission — Android/iOS insist the
// foreground grant come first, and the background prompt is a separate,
// second dialog. Returns false if either is denied, so callers can surface it
// rather than silently never tracking.
export async function startBackgroundTracking(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (foreground.status !== 'granted') {
    return false
  }
  const background = await Location.requestBackgroundPermissionsAsync()
  if (background.status !== 'granted') {
    return false
  }

  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    return true
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    // iOS: show the blue "using your location" bar rather than tracking
    // invisibly, and never let the OS pause updates when the driver stops at
    // a light — a frozen marker reads as a broken app to the customer.
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    // Android: background location REQUIRES a foreground service with a
    // persistent notification. This text is what the driver sees in their
    // notification shade for the whole delivery.
    foregroundService: {
      notificationTitle: 'Delivering an order',
      notificationBody: 'Sharing your live location with the customer',
      notificationColor: '#ffc20e',
    },
  })
  return true
}

// stopBackgroundTracking ends location reporting — called when a delivery
// ends, the driver goes offline, or they log out. Safe to call when not
// running.
export async function stopBackgroundTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  }
}

// hasBackgroundPermission reports whether tracking CAN run, without prompting
// — used to show the driver why their location isn't being shared.
export async function hasBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.getBackgroundPermissionsAsync()
  return status === 'granted'
}
