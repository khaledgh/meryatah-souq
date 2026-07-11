import { Feather } from '@expo/vector-icons'
import { Camera, GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { CameraRef } from '@maplibre/maplibre-react-native'

import { EmptyState } from '../../src/components/ui/empty-state'
import { MapPin } from '../../src/components/map/map-pin'
import { MapView } from '../../src/components/map/map-view'
import { useAvailability } from '../../src/features/driver/availability-context'
import { useActiveOrder } from '../../src/features/driver/use-active-order'
import { useUpdateOrderStatus } from '../../src/features/driver/use-update-order-status'
import { startBackgroundTracking, stopBackgroundTracking } from '../../src/features/tracking/location-task'
import { formatEta, useRoute } from '../../src/features/tracking/use-route'
import { toApiError } from '../../src/lib/api-client'

// D4 Active Order (blueprint §11.D4): the pickup→dropoff map, the status
// actions, and — while the delivery is under way — the background location
// reporting that makes the customer's live tracking map work.
export default function ActiveOrderScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError, refetch } = useActiveOrder()
  const updateStatus = useUpdateOrderStatus()
  const [actionError, setActionError] = useState<string | null>(null)
  const { location: driverLocation } = useAvailability()
  const cameraRef = useRef<CameraRef>(null)

  const isOnTheWay = order?.status === 'on_the_way'
  const hasVendorCoords = order?.vendor_longitude != null && order?.vendor_latitude != null

  const pickup = hasVendorCoords
    ? { longitude: order.vendor_longitude as number, latitude: order.vendor_latitude as number }
    : null
  const dropoff = order ? { longitude: order.delivery_longitude, latitude: order.delivery_latitude } : null

  // Before pickup the driver is heading to the store; after, to the customer.
  const routeFrom = driverLocation ?? pickup
  const routeTo = isOnTheWay ? dropoff : pickup
  const { data: route } = useRoute(routeFrom, routeTo)

  // Report position in the background for the whole delivery leg. This is
  // what keeps the customer's map alive when the driver locks their screen or
  // switches apps — the in-app socket used to die there, freezing the marker.
  useEffect(() => {
    if (!isOnTheWay) {
      void stopBackgroundTracking()
      return
    }
    void (async () => {
      const started = await startBackgroundTracking()
      if (!started) {
        setActionError(t('activeOrder.backgroundPermissionDenied'))
      }
    })()
  }, [isOnTheWay, t])

  // Stop reporting if this screen goes away with no delivery in flight (e.g.
  // logout) — never leave a location task running with nothing to report to.
  useEffect(() => {
    return () => {
      void stopBackgroundTracking()
    }
  }, [])

  // Keep every relevant point in view: the driver, the store, the customer.
  useEffect(() => {
    const points = [driverLocation, pickup, dropoff].filter((p): p is { longitude: number; latitude: number } => p != null)
    if (points.length < 2 || !cameraRef.current) {
      return
    }
    const lons = points.map((p) => p.longitude)
    const lats = points.map((p) => p.latitude)
    // LngLatBounds is flat [west, south, east, north].
    cameraRef.current.fitBounds(
      [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 600 },
    )
  }, [driverLocation?.longitude, driverLocation?.latitude, pickup?.longitude, pickup?.latitude, dropoff?.longitude, dropoff?.latitude])

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center">
        <ActivityIndicator color="#ffc20e" size="large" />
      </SafeAreaView>
    )
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center p-5">
        <Text className="text-sm text-red-600 dark:text-red-400 mb-4">{t('common.error')}</Text>
        <Pressable
          onPress={() => void refetch()}
          className="rounded-2xl px-6 py-3 active:opacity-90"
          style={{ backgroundColor: '#ffc20e' }}
        >
          <Text className="text-sm font-bold text-gray-900">{t('common.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
        <EmptyState icon="package" title={t('activeOrder.title')} description={t('activeOrder.emptyDesc')} />
      </SafeAreaView>
    )
  }

  const handleStartDelivery = () => {
    setActionError(null)
    updateStatus.mutate(
      { orderId: order.id, status: 'on_the_way' },
      { onError: (err) => { setActionError(toApiError(err).user_message) } },
    )
  }

  const handleMarkDelivered = () => {
    Alert.alert(t('activeOrder.confirmDeliveredTitle'), t('activeOrder.confirmDeliveredMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('activeOrder.markDelivered'),
        onPress: () => {
          setActionError(null)
          updateStatus.mutate(
            { orderId: order.id, status: 'delivered' },
            {
              onSuccess: () => {
                void stopBackgroundTracking()
                void queryClient.invalidateQueries({ queryKey: ['driver-available-orders'] })
              },
              onError: (err) => { setActionError(toApiError(err).user_message) },
            },
          )
        },
      },
    ])
  }

  // Hand off to the OS maps app for real turn-by-turn. The in-app route line
  // is for context — it is not navigation, and pretending otherwise would be
  // worse than sending the driver to a tool built for it.
  const openNavigation = () => {
    const target = isOnTheWay ? dropoff : pickup
    if (!target) return
    const { latitude, longitude } = target
    const url = Platform.select({
      ios: `maps://app?daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
      default: `https://www.openstreetmap.org/directions?to=${latitude},${longitude}`,
    })
    void Linking.openURL(url).catch(() => {
      setActionError(t('activeOrder.navigationFailed'))
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3 border-b border-gray-100 dark:border-gray-900">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">{t('activeOrder.title')}</Text>
        <Text className="text-xs text-gray-400">#{order.id.substring(0, 8)}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="h-72 w-full bg-gray-100 dark:bg-gray-800 relative">
          <MapView style={{ width: '100%', height: '100%' }}>
            <Camera
              ref={cameraRef}
              initialViewState={{
                center: [order.delivery_longitude, order.delivery_latitude],
                zoom: 12,
              }}
            />

            {route ? (
              <GeoJSONSource id="route" data={route.geometry}>
                <Layer
                  id="route-line"
                  type="line"
                  style={{
                    lineColor: '#2563eb',
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
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

          {route ? (
            <View className="absolute top-3 start-3 bg-black/70 rounded-full px-3 py-1.5">
              <Text className="text-[11px] text-white font-bold">
                {isOnTheWay ? t('activeOrder.etaToCustomer') : t('activeOrder.etaToStore')}
                {': '}
                {formatEta(route.duration_seconds)}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={openNavigation}
            className="absolute bottom-3 end-3 flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2.5 shadow-lg active:opacity-80 dark:bg-gray-900"
          >
            <Feather name="navigation" size={14} color="#2563eb" />
            <Text className="text-xs font-bold text-blue-600">{t('activeOrder.navigate')}</Text>
          </Pressable>
        </View>

        <View className="mx-4 my-4 bg-white dark:bg-gray-900 rounded-3xl p-5 gap-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <View className="flex-row items-center gap-3">
            <View className="size-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#ffc20e22' }}>
              <Feather name="shopping-bag" size={18} color="#ffc20e" />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-gray-400 dark:text-gray-500">{t('activeOrder.vendor')}</Text>
              <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {order.vendor_name ?? order.vendor_id}
              </Text>
            </View>
          </View>

          <View className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 flex-row justify-between items-center">
            <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('activeOrder.payout')}</Text>
            <Text className="text-base font-black" style={{ color: '#ffc20e' }}>
              ${order.subtotal_display.toFixed(2)} {order.currency_code}
            </Text>
          </View>
        </View>

        {order.items && order.items.length > 0 ? (
          <View className="mx-4 mb-4 bg-white dark:bg-gray-900 rounded-3xl p-5 gap-2" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
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
        ) : null}

        {actionError ? (
          <Text className="mx-4 mb-3 text-sm text-red-600 dark:text-red-400">{actionError}</Text>
        ) : null}

        <View className="px-4 gap-3">
          {order.status === 'accepted' || order.status === 'preparing' ? (
            <Pressable
              onPress={handleStartDelivery}
              disabled={updateStatus.isPending}
              className="items-center justify-center rounded-2xl py-4 active:opacity-90"
              style={{ backgroundColor: '#ffc20e', opacity: updateStatus.isPending ? 0.6 : 1 }}
            >
              {updateStatus.isPending ? (
                <ActivityIndicator color="#1a1a1a" />
              ) : (
                <Text className="text-sm font-bold text-gray-900">{t('activeOrder.startDelivery')}</Text>
              )}
            </Pressable>
          ) : null}

          {isOnTheWay ? (
            <Pressable
              onPress={handleMarkDelivered}
              disabled={updateStatus.isPending}
              className="items-center justify-center rounded-2xl py-4 active:opacity-90 bg-green-600"
              style={{ opacity: updateStatus.isPending ? 0.6 : 1 }}
            >
              {updateStatus.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">{t('activeOrder.markDelivered')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
