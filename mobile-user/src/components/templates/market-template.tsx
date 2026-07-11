import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

/**
 * Market / weight-grid template — compact 2-column card with a large
 * circular image (produce feel), name, and price + round add button.
 * Uses the app's dark theme background.
 */
export function MarketProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)
  const accent = accentColor ?? '#16a34a'

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 20,
        backgroundColor: '#1e2235',
        padding: 12,
        alignItems: 'center',
        maxWidth: '48.5%',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      {/* Circular produce image */}
      <View
        style={{
          width: 90,
          height: 90,
          borderRadius: 45,
          overflow: 'hidden',
          backgroundColor: '#2a2e45',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Feather name="shopping-bag" size={28} color="#4b5563" />
        )}
        {!hasStock && (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
              {t('product.outOfStock', 'Out')}
            </Text>
          </View>
        )}
      </View>

      <Text
        style={{ fontSize: 12, fontWeight: '700', color: '#f9fafb', textAlign: 'center' }}
        numberOfLines={1}
      >
        {productDisplayName(product, i18n.language)}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>
          ${product.price_usd.toFixed(2)}
        </Text>
        <Pressable
          onPress={onAdd}
          disabled={!hasStock}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hasStock ? accent : '#374151',
          }}
        >
          <Feather name="plus" size={15} color={hasStock ? '#fff' : '#6b7280'} />
        </Pressable>
      </View>
    </Pressable>
  )
}
