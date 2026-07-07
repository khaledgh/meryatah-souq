import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { EmptyState } from '../../../src/components/ui/empty-state'
import { useMyOrders } from '../../../src/features/orders/use-my-orders'
import { type Order } from '../../../src/schemas/order'

export default function OrdersScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: orders, isLoading, isError, refetch } = useMyOrders()

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#f59e0b" size="large" />
        </View>
      </SafeAreaView>
    )
  }

  if (isError || !orders) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
        <View className="flex-1 items-center justify-center p-5">
          <Text className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
            {t('orders.error', 'Failed to load your orders')}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            className="rounded-xl bg-brand-600 px-6 py-3 active:bg-brand-700"
          >
            <Text className="text-sm font-semibold text-white">{t('common.retry', 'Retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (orders.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
        <View className="px-5 py-3">
          <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('orders.title', 'My Orders')}
          </Text>
        </View>
        <EmptyState
          icon="file-text"
          title={t('orders.emptyTitle', 'No orders placed yet')}
          description={t('orders.emptyDescription', 'You have not placed any orders. Start ordering groceries now!')}
          actionLabel={t('orders.shopNow', 'Shop Now')}
          onAction={() => router.push('/home')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {t('orders.title', 'My Orders')}
        </Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 py-4 gap-4"
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  )
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const { t } = useTranslation()
  const isActive = order.status !== 'delivered' && order.status !== 'cancelled'
  const dateStr = new Date(order.placed_at).toLocaleDateString()

  const statusLabelMap: Record<string, string> = {
    pending: t('orders.statusPending', 'Pending'),
    accepted: t('orders.statusAccepted', 'Accepted'),
    preparing: t('orders.statusPreparing', 'Preparing'),
    on_the_way: t('orders.statusOnTheWay', 'On the Way'),
    delivered: t('orders.statusDelivered', 'Delivered'),
    cancelled: t('orders.statusCancelled', 'Cancelled'),
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
    >
      <View className={`size-12 items-center justify-center rounded-xl ${
        isActive ? 'bg-brand-50 dark:bg-brand-950/30' : 'bg-gray-50 dark:bg-gray-800'
      }`}>
        <Feather
          name={isActive ? 'truck' : 'check-square'}
          size={20}
          color={isActive ? '#f59e0b' : '#9ca3af'}
        />
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-center">
          <Text className="text-sm font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
            {order.vendor_name || t('orders.genericVendor', 'Store Order')}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            {dateStr}
          </Text>
        </View>
        
        <View className="flex-row justify-between items-center mt-1.5">
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            ${order.subtotal_display.toFixed(2)} · {order.currency_code}
          </Text>
          <View className={`rounded-full px-2.5 py-0.5 ${
            isActive ? 'bg-brand-100 dark:bg-brand-950/40' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <Text className={`text-[10px] font-bold ${
              isActive ? 'text-brand-700 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {statusLabelMap[order.status] || order.status}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
}
