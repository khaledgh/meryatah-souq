import * as Location from 'expo-location'
import { useEffect, useRef, useState } from 'react'

import { apiClient, BASE_URL } from '../../lib/api-client'

export type WsStatus = 'disconnected' | 'connecting' | 'connected'

// Cadence for outbound position sends while a delivery is on_the_way.
// 5 seconds matches the interval mobile-user's tracking screen effectively
// observes in practice (comparable live-tracking apps use 3-10s; 5s is a
// reasonable middle ground between map smoothness and battery/bandwidth
// cost) and is well within the server's pongTimeout (60s) and NOT tied to
// the watchPositionAsync distanceInterval, which only fires on movement —
// this hook also does a fixed-interval send so a stationary driver still
// keeps the customer's map "live" instead of looking frozen/disconnected.
const SEND_INTERVAL_MS = 5000

// D4 Active Order (blueprint §4.9, §11.D4): the driver app is the WRITE
// side of the same WS channel mobile-user's order/[id].tsx reads from. It
// opens GET /ws/orders/:orderId/track?ticket=... (after POST /ws/ticket,
// same one-time-ticket pattern) and sends raw
// `{ longitude, latitude, heading }` JSON frames — NOT wrapped in a `type`
// envelope, per backend/internal/ws/client.go ReadPump's inbound message
// struct, which has no `type` field. (The server adds `type:
// "driver_location"` only on the OUTBOUND broadcast back to room members,
// per handlers/ws.go TrackOrder — that envelope is for readers, not
// writers.) Connects only while `active` is true (i.e. order status is
// on_the_way) and reconnects with backoff on drop, mirroring mobile-user's
// reconnect pattern.
export function useLocationStream(orderId: string | undefined, active: boolean) {
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!active || !orderId) {
      setStatus('disconnected')
      return
    }

    let alive = true
    let sendTimer: ReturnType<typeof setInterval> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let watchSubscription: Location.LocationSubscription | null = null
    let lastKnown: { longitude: number; latitude: number; heading: number } | null = null

    const sendCurrentPosition = (socket: WebSocket) => {
      if (!lastKnown || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify(lastKnown))
    }

    const connect = async () => {
      setStatus('connecting')
      try {
        const ticketRes = await apiClient.post<{ data: { ticket: string } }>('/ws/ticket')
        const ticket = ticketRes.data.data.ticket
        if (!alive) return

        const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws'
        const rawHost = BASE_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${wsProtocol}://${rawHost}/ws/orders/${orderId}/track?ticket=${ticket}`

        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          if (!alive) return
          setStatus('connected')
          sendCurrentPosition(socket)
          sendTimer = setInterval(() => { sendCurrentPosition(socket) }, SEND_INTERVAL_MS)
        }

        socket.onclose = () => {
          if (sendTimer) clearInterval(sendTimer)
          if (!alive) return
          setStatus('disconnected')
          reconnectTimer = setTimeout(() => { void connect() }, 3000)
        }

        socket.onerror = () => {
          if (!alive) return
          setStatus('disconnected')
        }
      } catch {
        if (!alive) return
        setStatus('disconnected')
        reconnectTimer = setTimeout(() => { void connect() }, 5000)
      }
    }

    const startLocationWatch = async () => {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync()
      if (permStatus !== 'granted' || !alive) return

      const initial = await Location.getCurrentPositionAsync({})
      lastKnown = {
        longitude: initial.coords.longitude,
        latitude: initial.coords.latitude,
        heading: initial.coords.heading ?? 0,
      }

      watchSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
        (update) => {
          lastKnown = {
            longitude: update.coords.longitude,
            latitude: update.coords.latitude,
            heading: update.coords.heading ?? 0,
          }
        },
      )
    }

    void startLocationWatch()
    void connect()

    return () => {
      alive = false
      if (sendTimer) clearInterval(sendTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      watchSubscription?.remove()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [orderId, active])

  return status
}
