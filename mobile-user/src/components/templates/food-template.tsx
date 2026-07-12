import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayDescription, productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

export function FoodProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)
  const accent = accentColor ?? '#ffc20e'

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderRadius: 20,
        backgroundColor: '#1e2235',
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      {/* Square food image */}
      <View
        style={{
          width: 86,
          height: 86,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#252b44',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Feather name="image" size={28} color="#4b5563" />
        )}
        {!hasStock && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
              {t('product.outOfStock', 'Out of stock')}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#f9fafb' }} numberOfLines={1}>
          {productDisplayName(product, i18n.language)}
        </Text>
        <Text style={{ fontSize: 11, color: '#9ca3af', lineHeight: 15 }} numberOfLines={2}>
          {productDisplayDescription(product, i18n.language)}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: accent, marginTop: 3 }}>
          ${product.price_usd.toFixed(2)}
        </Text>
      </View>

      {/* Round add button */}
      <Pressable
        onPress={onAdd}
        disabled={!hasStock}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hasStock ? accent : '#252b44',
          flexShrink: 0,
        }}
      >
        <Feather name="plus" size={20} color={hasStock ? '#1a1a1a' : '#6b7280'} />
      </Pressable>
    </Pressable>
  )
}
