import { Feather } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import MapView, { Marker } from 'react-native-maps'

import { EmptyState } from '../../src/components/ui/empty-state'
import { useAvailability } from '../../src/features/driver/availability-context'
import { useActiveOrder } from '../../src/features/driver/use-active-order'
import { useUpdateOrderStatus } from '../../src/features/driver/use-update-order-status'
import { useLocationStream } from '../../src/features/tracking/use-location-stream'
import { toApiError } from '../../src/lib/api-client'

// D4 Active Order (blueprint §11.D4): map pickup→dropoff, status actions,
// and — while status is on_the_way — the open, actively-sending WS
// connection that makes mobile-user's live-tracking map work. The driver
// app is the producer for that channel; it only streams while this screen
// is mounted AND the order is on_the_way (useLocationStream's `active` flag).
export default function ActiveOrderScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError, refetch } = useActiveOrder()
  const updateStatus = useUpdateOrderStatus()
  const [actionError, setActionError] = useState<string | null>(null)
  const { location: driverLocation } = useAvailability()

  const isOnTheWay = order?.status === 'on_the_way'
  const wsStatus = useLocationStream(order?.id, isOnTheWay)
  const hasVendorCoords = order?.vendor_longitude != null && order?.vendor_latitude != null

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
                void queryClient.invalidateQueries({ queryKey: ['driver-available-orders'] })
              },
              onError: (err) => { setActionError(toApiError(err).user_message) },
            },
          )
        },
      },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3 border-b border-gray-100 dark:border-gray-900">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">{t('activeOrder.title')}</Text>
        <Text className="text-xs text-gray-400">#{order.id.substring(0, 8)}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="h-64 w-full bg-gray-100 dark:bg-gray-800 relative">
          <MapView
            style={{ width: '100%', height: '100%' }}
            initialRegion={{
              latitude: order.delivery_latitude,
              longitude: order.delivery_longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            {hasVendorCoords ? (
              <Marker
                coordinate={{ latitude: order.vendor_latitude as number, longitude: order.vendor_longitude as number }}
                title={order.vendor_name ?? t('activeOrder.pickup')}
                pinColor="#ffc20e"
              />
            ) : null}
            <Marker
              coordinate={{ latitude: order.delivery_latitude, longitude: order.delivery_longitude }}
              title={t('activeOrder.dropoff')}
              pinColor="red"
            />
            {driverLocation ? (
              <Marker
                coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
                title={t('activeOrder.you')}
                pinColor="#2563eb"
                rotation={driverLocation.heading ?? 0}
              />
            ) : null}
          </MapView>

          {isOnTheWay ? (
            <View className="absolute top-3 start-3 bg-black/60 rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
              <View className={`size-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
              <Text className="text-[10px] text-white font-bold uppercase">
                {wsStatus === 'connected' ? t('activeOrder.live') : t('activeOrder.disconnected')}
              </Text>
            </View>
          ) : null}
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
