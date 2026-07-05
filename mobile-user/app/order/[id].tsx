import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'

import { Button } from '../../src/components/ui/button'
import { useOrder } from '../../src/features/orders/use-my-orders'
import { apiClient, BASE_URL } from '../../src/lib/api-client'

interface DriverLocation {
  longitude: number
  latitude: number
  heading: number
}

export default function OrderTrackingScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { data: order, isLoading, isError, refetch } = useOrder(orderId)

  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  // Status mapping to vertical step index
  const statusStepIndexMap: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    on_the_way: 3,
    delivered: 4,
    cancelled: -1,
  }

  const currentStep = order ? statusStepIndexMap[order.status] ?? 0 : 0
  const isCancelled = order?.status === 'cancelled'

  useEffect(() => {
    if (!order || order.status !== 'on_the_way') {
      setDriverLocation(null)
      return
    }

    let socket: WebSocket | null = null
    let active = true

    const connectWS = async () => {
      setWsStatus('connecting')
      try {
        // 1. Get one-time WS ticket
        const ticketRes = await apiClient.post<{ data: { ticket: string } }>('/ws/ticket')
        const ticket = ticketRes.data.data.ticket

        if (!active) return

        // 2. Build WS URL
        const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws'
        const rawHost = BASE_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${wsProtocol}://${rawHost}/ws/orders/${String(orderId)}/track?ticket=${ticket}`

        // 3. Connect WebSocket
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          if (active) setWsStatus('connected')
        }

        socket.onmessage = (event) => {
          if (!active) return
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'driver_location') {
              setDriverLocation({
                longitude: data.longitude,
                latitude: data.latitude,
                heading: data.heading ?? 0,
              })
            }
          } catch {
            // ignore malformed messages
          }
        }

        socket.onclose = () => {
          if (active) {
            setWsStatus('disconnected')
            // Reconnect after 3 seconds if still on the way
            setTimeout(() => {
              if (active) connectWS()
            }, 3000)
          }
        }

        socket.onerror = () => {
          if (active) setWsStatus('disconnected')
        }
      } catch (err) {
        if (active) {
          setWsStatus('disconnected')
          // Retry connection after 5 seconds
          setTimeout(() => {
            if (active) connectWS()
          }, 5000)
        }
      }
    }

    void connectWS()

    return () => {
      active = false
      if (socket) {
        socket.close()
      }
    }
  }, [order?.status, orderId])

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center">
        <ActivityIndicator color="#10b981" size="large" />
      </SafeAreaView>
    )
  }

  if (isError || !order) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center p-5">
        <Text className="text-sm text-red-600 dark:text-red-400 mb-4">
          {t('orders.trackError', 'Failed to load order tracking details')}
        </Text>
        <Button label={t('common.retry', 'Retry')} onPress={() => void refetch()} />
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
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" className="dark:text-gray-200" />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('orders.trackTitle', 'Track Order')}
          </Text>
          <Text className="text-xs text-gray-400">#{order.id.substring(0, 8)}</Text>
        </View>
        <Pressable onPress={() => void refetch()} className="p-1">
          <Feather name="refresh-cw" size={20} color="#374151" className="dark:text-gray-200" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Live Map Section (Only if status is on_the_way and we have coordinates) */}
        {order.status === 'on_the_way' ? (
          <View className="h-64 w-full bg-gray-100 dark:bg-gray-800 relative">
            <MapView
              style={{ width: '100%', height: '100%' }}
              initialRegion={{
                latitude: order.delivery_latitude || 33.8938,
                longitude: order.delivery_longitude || 35.5018,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              {/* Delivery Marker */}
              <Marker
                coordinate={{
                  latitude: order.delivery_latitude || 33.8938,
                  longitude: order.delivery_longitude || 35.5018,
                }}
                title={t('orders.deliveryLocation', 'Your Location')}
                pinColor="red"
              />

              {/* Driver Marker */}
              {driverLocation && (
                <Marker
                  coordinate={{
                    latitude: driverLocation.latitude,
                    longitude: driverLocation.longitude,
                  }}
                  title={t('orders.driverLocation', 'Driver')}
                  pinColor="green"
                />
              )}
            </MapView>
            
            {/* Live Indicator overlay */}
            <View className="absolute top-3 left-3 bg-black/60 rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
              <View className={`size-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <Text className="text-[10px] text-white font-bold uppercase">
                {wsStatus === 'connected' ? t('orders.live', 'Live') : t('orders.disconnected', 'Connecting...')}
              </Text>
            </View>
          </View>
        ) : (
          /* Static status card when not on the way */
          <View className="p-5 bg-emerald-50/20 border-b border-gray-100 dark:border-gray-900 dark:bg-emerald-950/10 items-center py-8">
            <View className="size-16 rounded-full bg-emerald-50 items-center justify-center mb-3 dark:bg-emerald-950/30">
              <Feather name={isCancelled ? 'x-circle' : 'package'} size={32} color={isCancelled ? '#ef4444' : '#10b981'} />
            </View>
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {isCancelled ? t('orders.statusCancelledMsg', 'Order Cancelled') : steps[currentStep]?.label}
            </Text>
            <Text className="text-sm text-gray-500 mt-1 dark:text-gray-400 text-center max-w-[240px]">
              {isCancelled ? t('orders.statusCancelledDesc', 'Your order was cancelled.') : steps[currentStep]?.desc}
            </Text>
          </View>
        )}

        {/* Status Stepper Timeline */}
        {!isCancelled && (
          <View className="p-5 border-b border-gray-50 dark:border-gray-900">
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t('orders.timeline', 'Delivery Progress')}
            </Text>
            <View className="gap-6 pl-2">
              {steps.map((step, index) => {
                const isPassed = index <= currentStep
                const isCurrent = index === currentStep
                return (
                  <View key={index} className="flex-row gap-4 relative">
                    {/* Stepper line */}
                    {index < steps.length - 1 && (
                      <View
                        className={`absolute left-2.5 top-6 bottom-[-24px] w-[2px] ${
                          index < currentStep ? 'bg-emerald-500' : 'bg-gray-100 dark:bg-gray-800'
                        }`}
                      />
                    )}

                    {/* Stepper Dot */}
                    <View
                      className={`size-6 rounded-full items-center justify-center z-10 ${
                        isCurrent
                          ? 'bg-emerald-500 border-4 border-emerald-100 dark:border-emerald-950'
                          : isPassed
                          ? 'bg-emerald-500'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      {isPassed && !isCurrent && (
                        <Feather name="check" size={12} color="#fff" />
                      )}
                    </View>

                    {/* Stepper Content */}
                    <View className="flex-1 mt-0.5">
                      <Text
                        className={`text-sm font-bold ${
                          isCurrent
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isPassed
                            ? 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </Text>
                      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {step.desc}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Order Details Summary */}
        <View className="p-5 border-b border-gray-50 dark:border-gray-900 gap-3">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('orders.summary', 'Order Items')}
          </Text>
          {/* Note: In full stack GORM database, items are linked. Since the client API returns
              nested items when retrieved via GetByID handler, we map them directly. */}
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
              <Text className="text-base font-black text-emerald-600 dark:text-emerald-400">
                ${order.subtotal_display.toFixed(2)} {order.currency_code}
              </Text>
              {order.exchange_rate > 1 && (
                <Text className="text-[10px] text-gray-400">
                  Rate: 1 USD = {order.exchange_rate.toLocaleString()} {order.currency_code}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Actions Bar */}
        {order.status === 'delivered' && (
          <View className="p-5 gap-3">
            <Button
              label={t('orders.rateDriver', 'Rate Your Driver')}
              onPress={() => router.push({ pathname: '/order/[id]/rate', params: { id: order.id } })}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// Simple fallback ScrollView because flat list numColumns is not used here.
import { ScrollView } from 'react-native'
