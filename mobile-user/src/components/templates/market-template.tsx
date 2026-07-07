import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

// Market/vegetables section template: a compact 2-column grid with a round
// (produce-like) image frame and price pinned to the bottom — no
// description line, small footprint so many items are scannable at once.
// (The product model has no weight/unit field yet — price is the only
// numeric shown; a future "unit" column on products would slot in here.)
export function MarketProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-2xl border border-gray-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900 shadow-sm gap-1.5"
      style={{ maxWidth: '48.5%' }}
    >
      <View className="aspect-square rounded-full self-center w-4/5 bg-gray-50 dark:bg-gray-800 overflow-hidden items-center justify-center relative">
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
        ) : (
          <Feather name="shopping-bag" size={26} color="#d1d5db" />
        )}
        {!hasStock && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <Text className="text-white text-[9px] font-bold uppercase">{t('product.outOfStock', 'Out')}</Text>
          </View>
        )}
      </View>

      <Text className="text-xs font-bold text-gray-900 dark:text-gray-100 text-center" numberOfLines={1}>
        {productDisplayName(product, i18n.language)}
      </Text>

      <View className="flex-row items-center justify-between mt-0.5">
        <Text className="text-sm font-bold" style={{ color: accentColor }}>
          ${product.price_usd.toFixed(2)}
        </Text>
        <Pressable
          onPress={onAdd}
          disabled={!hasStock}
          className="size-7 rounded-full items-center justify-center"
          style={{ backgroundColor: hasStock ? accentColor : undefined }}
        >
          <Feather name="plus" size={14} color={hasStock ? '#fff' : '#9ca3af'} />
        </Pressable>
      </View>
    </Pressable>
  )
}
