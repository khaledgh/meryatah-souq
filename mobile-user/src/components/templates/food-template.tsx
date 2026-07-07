import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayDescription, productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

// Food section template: a full-width menu-style row (image left, name +
// description + price, add button on the right) — matches a restaurant
// menu rather than a generic product grid.
export function FoodProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-3xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
    >
      <View className="size-20 shrink-0 rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden items-center justify-center relative">
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
        ) : (
          <Feather name="image" size={28} color="#d1d5db" />
        )}
        {!hasStock && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white text-[10px] font-bold uppercase">{t('product.outOfStock', 'Out of stock')}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {productDisplayName(product, i18n.language)}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500" numberOfLines={2}>
          {productDisplayDescription(product, i18n.language)}
        </Text>
        <Text className="text-sm font-bold mt-1" style={{ color: accentColor }}>
          ${product.price_usd.toFixed(2)}
        </Text>
      </View>

      <Pressable
        onPress={onAdd}
        disabled={!hasStock}
        className="size-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: hasStock ? accentColor : undefined }}
      >
        <Feather name="plus" size={18} color={hasStock ? '#fff' : '#9ca3af'} />
      </Pressable>
    </Pressable>
  )
}
