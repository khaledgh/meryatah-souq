import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

// Electronics section template: a 2-column grid with a larger, more
// prominent image (brand/spec photography reads better big) and the price
// as the dominant text — no description line, unlike the food template,
// since electronics buyers scan by image + price first.
export function ElectronicsProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-3xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 shadow-sm gap-2"
      style={{ maxWidth: '48.5%' }}
    >
      <View className="aspect-[4/3] rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden items-center justify-center relative">
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="contain" />
        ) : (
          <Feather name="cpu" size={36} color="#d1d5db" />
        )}
        {!hasStock && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white text-xs font-bold uppercase">{t('product.outOfStock', 'Out of stock')}</Text>
          </View>
        )}
      </View>

      <Text className="text-sm font-bold text-gray-900 dark:text-gray-100" numberOfLines={2}>
        {productDisplayName(product, i18n.language)}
      </Text>

      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-base font-extrabold" style={{ color: accentColor }}>
          ${product.price_usd.toFixed(2)}
        </Text>
        <Pressable
          onPress={onAdd}
          disabled={!hasStock}
          className="size-8 rounded-xl items-center justify-center"
          style={{ backgroundColor: hasStock ? accentColor : undefined }}
        >
          <Feather name="plus" size={16} color={hasStock ? '#fff' : '#9ca3af'} />
        </Pressable>
      </View>
    </Pressable>
  )
}
