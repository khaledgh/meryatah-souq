import { Feather } from '@expo/vector-icons'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { resolveMediaUrl } from '../../lib/media'
import { productDisplayName } from '../../schemas/product'
import type { ProductCardProps } from './product-card-types'

/**
 * Generic 2-column grid card — matches mockup "Near by Offer" grid:
 * Large square food image, name below, price + round yellow add button at bottom.
 * Dark card background matching app dark theme.
 */
export function GenericProductCard({ product, accentColor, onPress, onAdd }: ProductCardProps) {
  const { t, i18n } = useTranslation()
  const hasStock = product.stock > 0
  const imageUrl = resolveMediaUrl(product.images[0]?.url)
  const accent = accentColor ?? '#ffc20e'

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 20,
        backgroundColor: '#1e2235',
        overflow: 'hidden',
        maxWidth: '48.5%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      {/* Large food image */}
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          backgroundColor: '#2a2e45',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <Feather name="image" size={36} color="#4b5563" />
        )}
        {!hasStock && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
              {t('product.outOfStock', 'Out of stock')}
            </Text>
          </View>
        )}
      </View>

      {/* Card body */}
      <View style={{ padding: 10, gap: 8 }}>
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: '#f9fafb' }}
          numberOfLines={1}
        >
          {productDisplayName(product, i18n.language)}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: accent }}>
            ${product.price_usd.toFixed(2)}
          </Text>
          <Pressable
            onPress={onAdd}
            disabled={!hasStock}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hasStock ? accent : '#374151',
            }}
          >
            <Feather name="plus" size={16} color={hasStock ? '#1a1a1a' : '#6b7280'} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}
