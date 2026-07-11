import { Feather } from '@expo/vector-icons'
import { Camera, GeoJSONSource, Layer, Marker, type CameraRef } from '@maplibre/maplibre-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { z } from 'zod'

import { MapPin } from '../../src/components/map/map-pin'
import { MapView } from '../../src/components/map/map-view'
import { useDriverLocation } from '../../src/features/orders/use-driver-location'
import { useOrder } from '../../src/features/orders/use-my-orders'
import { useFormatEta, useRoute } from '../../src/features/tracking/use-route'
import { useVendor } from '../../src/features/vendor/use-vendor'
import { apiClient, BASE_URL } from '../../src/lib/api-client'

interface DriverLocation {
  longitude: number
  latitude: number
  heading: number
}

// The frames the tracking WebSocket pushes (backend/internal/handlers/ws.go
// wraps every broadcast in a `type` envelope). Parsed rather than cast: this
// is untrusted input off a socket, and a malformed frame must be skipped, not
// crash the screen.
const driverLocationFrameSchema = z.object({
  type: z.literal('driver_location'),
  longitude: z.number(),
  latitude: z.number(),
  heading: z.number().optional(),
})

export default function OrderTrackingScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { data: order, isLoading, isError, refetch } = useOrder(orderId)
  const cameraRef = useRef<CameraRef>(null)
  const formatEta = useFormatEta()

  const isOnTheWay = order?.status === 'on_the_way'

  // The order payload carries the delivery point but not the store's, so the
  // vendor is fetched alongside it to draw the pickup end of the route.
  const { data: vendor } = useVendor(order?.vendor_id)

  // Seed the map with the driver's last known position; live movement then
  // arrives over the WebSocket below. Without this the map is empty until the
  // first frame lands — several seconds, or indefinitely if the driver's app
  // is between background fixes.
  const { data: seededLocation } = useDriverLocation(orderId, isOnTheWay)
  const [liveLocation, setLiveLocation] = useState<DriverLocation | null>(null)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const driverLocation = liveLocation ?? seededLocation ?? null

  const dropoff = order ? { longitude: order.delivery_longitude, latitude: order.delivery_latitude } : null
  const pickup =
    vendor?.longitude != null && vendor?.latitude != null
      ? { longitude: vendor.longitude, latitude: vendor.latitude }
      : null

  // Show the leg the customer actually cares about: where the driver is now,
  // and how long until they arrive.
  const { data: route } = useRoute(driverLocation ?? pickup, dropoff)

  const statusStepIndexMap: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    on_the_way: 3,
    delivered: 4,
    cancelled: -1,
  }

  const currentStep = order ? (statusStepIndexMap[order.status] ?? 0) : 0
  const isCancelled = order?.status === 'cancelled'

  // Depends only on the status and the order id — NOT the order object, whose
  // identity changes on every refetch and would tear down and reopen the
  // socket on each poll.
  useEffect(() => {
    if (!isOnTheWay) {
      setLiveLocation(null)
      return
    }

    let socket: WebSocket | null = null
    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connectWS = async () => {
      setWsStatus('connecting')
      try {
        const ticketRes = await apiClient.post<{ data: { ticket: string } }>('/ws/ticket')
        const ticket = ticketRes.data.data.ticket
        if (!active) return

        const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws'
        const rawHost = BASE_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${wsProtocol}://${rawHost}/ws/orders/${String(orderId)}/track?ticket=${ticket}`

        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          if (active) setWsStatus('connected')
        }

        socket.onmessage = (event) => {
          if (!active) return
          try {
            const frame = driverLocationFrameSchema.safeParse(JSON.parse(event.data as string))
            if (frame.success) {
              setLiveLocation({
                longitude: frame.data.longitude,
                latitude: frame.data.latitude,
                heading: frame.data.heading ?? 0,
              })
            }
          } catch {
            // Malformed frame — ignore it rather than tearing down a socket
            // that is otherwise healthy.
          }
        }

        socket.onclose = () => {
          if (!active) return
          setWsStatus('disconnected')
          retryTimer = setTimeout(() => {
            if (active) void connectWS()
          }, 3000)
        }

        socket.onerror = () => {
          if (active) setWsStatus('disconnected')
        }
      } catch {
        if (!active) return
        setWsStatus('disconnected')
        retryTimer = setTimeout(() => {
          if (active) void connectWS()
        }, 5000)
      }
    }

    void connectWS()

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [isOnTheWay, orderId])

  // Keep the driver and the destination both on screen as the driver moves.
  useEffect(() => {
    const points = [driverLocation, pickup, dropoff].filter(
      (p): p is { longitude: number; latitude: number } => p != null,
    )
    if (points.length < 2 || !cameraRef.current) return
    const lons = points.map((p) => p.longitude)
    const lats = points.map((p) => p.latitude)
    // LngLatBounds is flat [west, south, east, north].
    cameraRef.current.fitBounds(
      [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      { padding: { top: 50, bottom: 50, left: 50, right: 50 }, duration: 600 },
    )
  }, [
    driverLocation?.longitude,
    driverLocation?.latitude,
    pickup?.longitude,
    pickup?.latitude,
    dropoff?.longitude,
    dropoff?.latitude,
  ])

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center">
        <ActivityIndicator color="#f59e0b" size="large" />
      </SafeAreaView>
    )
  }

  if (isError || !order) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center p-5">
        <Text className="text-sm text-red-600 dark:text-red-400 mb-4">
          {t('orders.trackError', 'Failed to load order tracking details')}
        </Text>
        <Pressable
          onPress={() => void refetch()}
          className="rounded-2xl px-6 py-3 active:opacity-90"
          style={{ backgroundColor: '#ffc20e' }}
        >
          <Text className="text-sm font-bold text-gray-900">{t('common.retry', 'Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const steps = [
    { label: t('orders.stepPending', 'Order Placed'), desc: t('orders.stepPendingDesc', 'Waiting for store acceptance') },
    { label: t('orders.stepAccepted', 'Accepted'), desc: t('orders.stepAcceptedDesc', 'Store accepted your order') },
    { label: t('orders.stepPreparing', 'Preparing'), desc: t('orders.stepPreparingDesc', 'Your groceries are being packed') },
    { label: t('orders.stepOnTheWay', 'On the Way'), desc: t('orders.stepOnTheWayDesc', 'Driver is on the way to you') },
    { label: t('orders.stepDelivered', 'Delivered'), desc: t('orders.stepDeliveredDesc', 'Order received successfully') },
  ]

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('orders.trackTitle', 'Track Order')}
          </Text>
          <Text className="text-xs text-gray-400">#{order.id.substring(0, 8)}</Text>
        </View>
        <Pressable onPress={() => void refetch()} className="p-1">
          <Feather name="refresh-cw" size={20} color="#374151" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {isOnTheWay ? (
          <View className="h-72 w-full bg-gray-100 dark:bg-gray-800 relative">
            <MapView style={{ width: '100%', height: '100%' }}>
              <Camera
                ref={cameraRef}
                initialViewState={{
                  center: [order.delivery_longitude, order.delivery_latitude],
                  zoom: 13,
                }}
              />

              {route ? (
                <GeoJSONSource id="route" data={route.geometry}>
                  <Layer
                    id="route-line"
                    type="line"
                    style={{ lineColor: '#2563eb', lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
                  />
                </GeoJSONSource>
              ) : null}

              {pickup ? (
                <Marker id="pickup" lngLat={[pickup.longitude, pickup.latitude]}>
                  <MapPin kind="pickup" />
                </Marker>
              ) : null}
              {dropoff ? (
                <Marker id="dropoff" lngLat={[dropoff.longitude, dropoff.latitude]}>
                  <MapPin kind="dropoff" />
                </Marker>
              ) : null}
              {driverLocation ? (
                <Marker id="driver" lngLat={[driverLocation.longitude, driverLocation.latitude]}>
                  <MapPin kind="driver" />
                </Marker>
              ) : null}
            </MapView>

            <View className="absolute top-3 start-3 bg-black/60 rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
              <View className={`size-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
              <Text className="text-[10px] text-white font-bold uppercase">
                {wsStatus === 'connected' ? t('orders.live', 'Live') : t('orders.disconnected', 'Connecting...')}
              </Text>
            </View>

            <View
              className="absolute bottom-0 start-0 end-0 bg-white dark:bg-gray-900 px-5 py-4 flex-row items-center gap-3"
              style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            >
              <View className="size-12 rounded-2xl items-center justify-center" style={{ backgroundColor: '#ffc20e22' }}>
                <Feather name="truck" size={22} color="#ffc20e" />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-gray-400 dark:text-gray-500">{t('orders.driverOnTheWay', 'Driver')}</Text>
                <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {route
                    ? t('orders.arrivesIn', 'Arrives in {{eta}}', { eta: formatEta(route.duration_seconds) })
                    : t('orders.driverHeading', 'On the way to you')}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View className="p-5 bg-white dark:bg-gray-900 items-center py-8 mx-4 my-4 rounded-3xl" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 }}>
            <View
              className="size-16 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: isCancelled ? '#fee2e2' : '#ffc20e22' }}
            >
              <Feather name={isCancelled ? 'x-circle' : 'package'} size={32} color={isCancelled ? '#ef4444' : '#ffc20e'} />
            </View>
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {isCancelled ? t('orders.statusCancelledMsg', 'Order Cancelled') : steps[currentStep]?.label}
            </Text>
            <Text className="text-sm text-gray-500 mt-1 dark:text-gray-400 text-center max-w-[240px]">
              {isCancelled ? t('orders.statusCancelledDesc', 'Your order was cancelled.') : steps[currentStep]?.desc}
            </Text>
          </View>
        )}

        {!isCancelled && (
          <View className="mx-4 my-2 bg-white dark:bg-gray-900 rounded-3xl p-5" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
            <Text className="text-base font-extrabold text-gray-900 dark:text-gray-100 mb-5">
              {t('orders.timeline', 'Delivery Progress')}
            </Text>
            <View className="gap-5 ps-2">
              {steps.map((step, index) => {
                const isPassed = index <= currentStep
                const isCurrent = index === currentStep
                return (
                  <View key={step.label} className="flex-row gap-4 relative">
                    {index < steps.length - 1 && (
                      <View
                        style={{
                          position: 'absolute',
                          start: 11,
                          top: 24,
                          bottom: -20,
                          width: 2,
                          backgroundColor: index < currentStep ? '#ffc20e' : '#e5e7eb',
                        }}
                      />
                    )}

                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        backgroundColor: isPassed ? '#ffc20e' : '#f3f4f6',
                        borderWidth: isCurrent ? 3 : 0,
                        borderColor: '#fff9c4',
                      }}
                    >
                      {isPassed && !isCurrent && <Feather name="check" size={11} color="#1a1a1a" />}
                    </View>

                    <View className="flex-1 mt-0.5">
                      <Text
                        className="text-sm font-bold"
                        style={{ color: isCurrent ? '#ffc20e' : isPassed ? '#111827' : '#9ca3af' }}
                      >
                        {step.label}
                      </Text>
                      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{step.desc}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        <View className="mx-4 my-2 bg-white dark:bg-gray-900 rounded-3xl p-5 gap-3" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <Text className="text-base font-extrabold text-gray-900 dark:text-gray-100">
            {t('orders.summary', 'Order Items')}
          </Text>
          {order.items && order.items.length > 0 ? (
            <View className="gap-2">
              {order.items.map((item) => (
                <View key={item.id} className="flex-row justify-between">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {item.name} x {item.quantity}
                  </Text>
                  <Text className="text-sm text-gray-700 font-semibold dark:text-gray-300">
                    ${(item.unit_price_usd * item.quantity).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-xs text-gray-400">
              {t('orders.noItemsDetails', 'Items summary unavailable')}
            </Text>
          )}

          <View className="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700 flex-row justify-between items-center mt-2">
            <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {t('orders.totalPaid', 'Total')}
            </Text>
            <View className="items-end">
              <Text className="text-base font-black" style={{ color: '#ffc20e' }}>
                ${order.subtotal_display.toFixed(2)} {order.currency_code}
              </Text>
              {order.exchange_rate > 1 && (
                <Text className="text-[10px] text-gray-400">
                  {t('orders.exchangeRate', {
                    rate: order.exchange_rate.toLocaleString(),
                    currency: order.currency_code,
                  })}
                </Text>
              )}
            </View>
          </View>
        </View>

        {order.status === 'delivered' && (
          <View className="px-4 mb-4">
            <Pressable
              onPress={() => router.push({ pathname: '/order/[id]/rate', params: { id: order.id } })}
              className="items-center justify-center rounded-2xl py-4 active:opacity-90"
              style={{ backgroundColor: '#ffc20e', shadowColor: '#ffc20e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 }}
            >
              <Text className="text-sm font-bold text-gray-900">{t('orders.rateDriver', 'Rate Your Driver')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
