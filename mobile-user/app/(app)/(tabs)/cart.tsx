import { useRouter } from 'expo-router'
import { FlatList, Image, Text, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { Button } from '../../../src/components/ui/button'
import { EmptyState } from '../../../src/components/ui/empty-state'
import { QuantityStepper } from '../../../src/components/ui/quantity-stepper'
import { useCart } from '../../../src/features/cart/cart-context'
import { resolveMediaUrl } from '../../../src/lib/media'

export default function CartScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { items, updateQuantity, removeFromCart, subtotal } = useCart()

  if (items.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
        <View className="px-5 py-3">
          <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('cart.title', 'My Cart')}
          </Text>
        </View>
        <EmptyState
          icon="shopping-cart"
          title={t('cart.emptyTitle', 'Your cart is empty')}
          description={t('cart.emptyDescription', 'Browse stores near you and add items to your cart')}
          actionLabel={t('cart.shopNow', 'Shop Now')}
          onAction={() => router.push('/home')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-row justify-between items-center">
        <View>
          <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('cart.title', 'My Cart')}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t('cart.vendorName', { name: items[0]?.vendorName ?? '' })}
          </Text>
        </View>
      </View>

      {/* Cart Items List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 py-4 gap-4"
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
            <View className="size-16 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden items-center justify-center">
              {resolveMediaUrl(item.imageUrl) ? (
                <Image source={{ uri: resolveMediaUrl(item.imageUrl) }} className="w-full h-full" />
              ) : (
                <Feather name="image" size={24} color="#9ca3af" />
              )}
            </View>

            <View className="flex-1 min-w-0">
              <Text className="text-sm font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                ${item.priceUsd.toFixed(2)}
              </Text>
            </View>

            <View className="items-end gap-2">
              <Pressable onPress={() => removeFromCart(item.id)} className="p-1">
                <Feather name="trash-2" size={16} color="#ef4444" />
              </Pressable>
              <QuantityStepper
                value={item.quantity}
                onChange={(qty) => updateQuantity(item.id, qty)}
                size="sm"
              />
            </View>
          </View>
        )}
      />

      {/* Footer / Summary */}
      <View className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-base font-semibold text-gray-500 dark:text-gray-400">
            {t('cart.subtotal', 'Subtotal')}
          </Text>
          <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
            ${subtotal.toFixed(2)}
          </Text>
        </View>

        <Button
          label={t('cart.checkout', 'Proceed to Checkout')}
          onPress={() => router.push('/checkout')}
        />
      </View>
    </SafeAreaView>
  )
}
