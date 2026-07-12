import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Badge } from '../../src/components/ui/badge'
import { Card } from '../../src/components/ui/card'
import { EmptyState } from '../../src/components/ui/empty-state'
import { RequestCardSkeleton } from '../../src/components/ui/loading-skeleton'
import { useAvailability } from '../../src/features/driver/availability-context'
import { useAcceptOrder } from '../../src/features/driver/use-accept-order'
import { useActiveOrder } from '../../src/features/driver/use-active-order'
import { useAvailableOrders } from '../../src/features/driver/use-available-orders'
import { toApiError } from '../../src/lib/api-client'
import { haversineKm } from '../../src/lib/geo'
import type { AvailableOrder } from '../../src/schemas/driver'

// D2 Availability + D3 Incoming Requests (blueprint §11.D2/D3): the toggle
// gates both location streaming and whether the requests list polls at
// all — offline drivers and drivers already on a delivery never poll, per
// the task's "don't poll while offline or while the driver already has an
// active order" rule.
export default function HomeScreen() {
  const { t } = useTranslation()
  const { isOnline, isToggling, location, permissionDenied, error: availabilityError, goOnline, goOffline } =
    useAvailability()
  const { data: activeOrder, isLoading: isActiveLoading } = useActiveOrder()
  const hasActiveOrder = !!activeOrder

  const canPoll = isOnline && !hasActiveOrder && !isActiveLoading
  const { data: orders, isLoading, isError, refetch, isRefetching } = useAvailableOrders(canPoll)
  const acceptMutation = useAcceptOrder()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [acceptErrorText, setAcceptErrorText] = useState<string | null>(null)

  const handleToggle = async (value: boolean) => {
    setAcceptErrorText(null)
    if (value) {
      const granted = await goOnline()
      if (!granted) {
        Alert.alert(t('availability.locationPermissionTitle'), t('availability.locationPermissionDenied'))
      }
    } else {
      if (hasActiveOrder) {
        Alert.alert(t('availability.title'), t('availability.hasActiveOrder'))
        return
      }
      await goOffline()
    }
  }

  const handleAccept = (order: AvailableOrder) => {
    setAcceptErrorText(null)
    acceptMutation.mutate(order.id, {
      onSuccess: () => {
        router.push('/(app)/active')
      },
      onError: (err) => {
        const apiErr = toApiError(err)
        if (apiErr.code === 'ORDER_ALREADY_ASSIGNED' || apiErr.code === 'ORDER_NOT_ACCEPTED') {
          setAcceptErrorText(t('requests.alreadyAssigned'))
          void refetch()
        } else {
          setAcceptErrorText(apiErr.user_message)
        }
      },
    })
  }

  const handleDecline = (orderId: string) => {
    setDismissedIds((prev) => new Set(prev).add(orderId))
  }

  const visibleOrders = (orders ?? []).filter((o) => !dismissedIds.has(o.id))

  const emptyMessage = !isOnline
    ? t('requests.emptyOffline')
    : hasActiveOrder
    ? t('requests.emptyActiveOrder')
    : t('requests.empty')

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      {/* Availability card */}
      <View className="px-5 pt-4 pb-2">
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View
                className={`size-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
              />
              <View>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {isOnline ? t('availability.online') : t('availability.offline')}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 max-w-[220px]">
                  {isOnline ? t('availability.onlineDesc') : t('availability.offlineDesc')}
                </Text>
              </View>
            </View>
            {isToggling ? (
              <ActivityIndicator color="#ffc20e" />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={(value) => void handleToggle(value)}
                trackColor={{ false: '#d1d5db', true: '#ffc20e' }}
                thumbColor="#ffffff"
              />
            )}
          </View>
          {availabilityError ? (
            <Text className="text-xs text-red-600 dark:text-red-400 mt-2">{availabilityError}</Text>
          ) : null}
          {permissionDenied ? (
            <Text className="text-xs text-red-600 dark:text-red-400 mt-2">
              {t('availability.locationPermissionDenied')}
            </Text>
          ) : null}
        </Card>
      </View>

      {/* Requests list */}
      <View className="px-5 pt-2 pb-1 flex-row items-center justify-between">
        <Text className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{t('requests.title')}</Text>
        {isRefetching ? <ActivityIndicator size="small" color="#ffc20e" /> : null}
      </View>

      {acceptErrorText ? (
        <View className="px-5 pb-1">
          <Text className="text-xs text-red-600 dark:text-red-400">{acceptErrorText}</Text>
        </View>
      ) : null}

      {isLoading && canPoll ? (
        <View className="px-5 gap-3">
          <RequestCardSkeleton />
          <RequestCardSkeleton />
        </View>
      ) : isError && canPoll ? (
        <EmptyState
          icon="alert-circle"
          title={t('common.error')}
          description={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
        />
      ) : visibleOrders.length === 0 ? (
        <EmptyState icon="inbox" title={t('requests.title')} description={emptyMessage} />
      ) : (
        <FlatList
          data={visibleOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          renderItem={({ item }) => {
            // Prefer the server's PostGIS distance (it also drove the radius
            // filter, so it's the same number the match was made on). It's 0
            // when the server had no position for this driver yet — only then
            // fall back to computing it here from the live GPS fix.
            const distanceKm =
              item.pickup_distance_meters > 0
                ? item.pickup_distance_meters / 1000
                : location
                  ? haversineKm(
                      { latitude: location.latitude, longitude: location.longitude },
                      { latitude: item.vendor_latitude, longitude: item.vendor_longitude },
                    )
                  : null
            return (
              <Card>
                <View className="flex-row items-start justify-between mb-2">
                  <Text className="text-base font-bold text-gray-900 dark:text-gray-100 flex-1 me-2">
                    {item.vendor_name}
                  </Text>
                  <Badge variant="brand">
                    {`$${item.subtotal_usd.toFixed(2)}`}
                  </Badge>
                </View>
                {distanceKm !== null ? (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    {t('requests.distanceToPickup', { km: distanceKm.toFixed(1) })}
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => handleAccept(item)}
                    disabled={acceptMutation.isPending}
                    className="flex-1 items-center justify-center rounded-xl bg-brand-600 py-3 active:bg-brand-700"
                    style={{ opacity: acceptMutation.isPending ? 0.6 : 1 }}
                  >
                    <Text className="text-sm font-bold text-gray-950">{t('requests.accept')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDecline(item.id)}
                    className="flex-1 items-center justify-center rounded-xl border border-gray-300 py-3 active:bg-gray-50 dark:border-gray-700"
                  >
                    <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('requests.decline')}</Text>
                  </Pressable>
                </View>
              </Card>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
