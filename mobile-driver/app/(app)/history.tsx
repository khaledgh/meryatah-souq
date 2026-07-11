import { Feather } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Badge } from '../../src/components/ui/badge'
import { Card } from '../../src/components/ui/card'
import { EmptyState } from '../../src/components/ui/empty-state'
import { ListRowSkeleton } from '../../src/components/ui/loading-skeleton'
import { useOrderHistory } from '../../src/features/driver/use-order-history'
import { useRatings } from '../../src/features/driver/use-ratings'
import type { Order, OrderStatus } from '../../src/schemas/order'

type StatusFilter = 'all' | 'delivered' | 'cancelled'

const statusBadgeVariant: Record<OrderStatus, 'success' | 'error' | 'neutral' | 'warning' | 'info' | 'brand'> = {
  pending: 'neutral',
  accepted: 'info',
  preparing: 'info',
  on_the_way: 'warning',
  delivered: 'success',
  cancelled: 'error',
}

// D5 History/Earnings (blueprint §11.D5): completed deliveries + ratings
// summary. Filter is a simple status toggle (all/delivered/cancelled) —
// per the task, don't over-build beyond that.
export default function HistoryScreen() {
  const { t } = useTranslation()
  const { data: orders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useOrderHistory()
  const { data: ratings, isLoading: ratingsLoading } = useRatings()
  const [filter, setFilter] = useState<StatusFilter>('all')

  const filteredOrders = useMemo(() => {
    if (!orders) return []
    if (filter === 'all') return orders
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  const averageRating = useMemo(() => {
    if (!ratings || ratings.length === 0) return null
    const total = ratings.reduce((sum, r) => sum + r.score, 0)
    return total / ratings.length
  }, [ratings])

  const deliveredCount = useMemo(
    () => (orders ?? []).filter((o) => o.status === 'delivered').length,
    [orders],
  )

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'delivered', label: t('history.filterDelivered') },
    { key: 'cancelled', label: t('history.filterCancelled') },
  ]

  const renderOrderRow = (order: Order) => (
    <Card key={order.id} className="mb-3">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
          #{order.id.substring(0, 8)}
        </Text>
        <Badge variant={statusBadgeVariant[order.status]}>{t(`orders.status.${order.status}`)}</Badge>
      </View>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        {new Date(order.placed_at).toLocaleString()}
      </Text>
      <Text className="text-sm font-semibold" style={{ color: '#ffc20e' }}>
        ${order.subtotal_display.toFixed(2)} {order.currency_code}
      </Text>
    </Card>
  )

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-xl font-extrabold text-gray-900 dark:text-gray-100">{t('history.title')}</Text>
      </View>

      <View className="px-5 pb-3">
        <Card>
          <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t('history.earningsSummary')}
          </Text>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-xs text-gray-400 dark:text-gray-500">{t('history.totalDeliveries')}</Text>
              <Text className="text-lg font-black text-gray-900 dark:text-gray-100">{deliveredCount}</Text>
            </View>
            <View>
              <Text className="text-xs text-gray-400 dark:text-gray-500">{t('history.averageRating')}</Text>
              <View className="flex-row items-center gap-1">
                <Feather name="star" size={14} color="#ffc20e" />
                <Text className="text-lg font-black text-gray-900 dark:text-gray-100">
                  {ratingsLoading ? '—' : averageRating !== null ? averageRating.toFixed(1) : '—'}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </View>

      <View className="px-5 pb-2 flex-row gap-2">
        {filters.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full border ${
              filter === f.key ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Text className={`text-xs font-semibold ${filter === f.key ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {ordersLoading ? (
        <View className="px-5 gap-3 pt-2">
          <ListRowSkeleton />
          <ListRowSkeleton />
          <ListRowSkeleton />
        </View>
      ) : ordersError ? (
        <EmptyState
          icon="alert-circle"
          title={t('common.error')}
          description={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void refetchOrders()}
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyState icon="clock" title={t('history.title')} description={t('history.empty')} />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item }) => renderOrderRow(item)}
          ListFooterComponent={
            <View className="mt-2">
              <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('history.recentRatings')}
              </Text>
              {ratingsLoading ? (
                <ActivityIndicator color="#ffc20e" />
              ) : !ratings || ratings.length === 0 ? (
                <Text className="text-xs text-gray-400 dark:text-gray-500">{t('history.noRatings')}</Text>
              ) : (
                ratings.slice(0, 10).map((rating) => (
                  <Card key={rating.id} className="mb-2">
                    <View className="flex-row items-center gap-1 mb-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Feather
                          key={i}
                          name="star"
                          size={12}
                          color={i < rating.score ? '#ffc20e' : '#e5e7eb'}
                        />
                      ))}
                    </View>
                    {rating.comment ? (
                      <Text className="text-xs text-gray-600 dark:text-gray-300">{rating.comment}</Text>
                    ) : null}
                  </Card>
                ))
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
