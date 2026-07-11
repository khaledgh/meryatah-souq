import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { QuantityStepper } from '../../src/components/ui/quantity-stepper'
import { resolveMediaUrl } from '../../src/lib/media'
import { useCart } from '../../src/features/cart/cart-context'
import { useStoreCategories } from '../../src/features/home/use-store-categories'
import { useProduct, useVendor, useVendorProducts } from '../../src/features/vendor/use-vendor'
import { vendorDisplayName } from '../../src/schemas/vendor'
import { productDisplayDescription, productDisplayName } from '../../src/schemas/product'
import { templateStyleFor } from '../../src/theme/template-kinds'

// ── Dark theme constants ───────────────────────────────────────────────────
const BG = '#0f111a'
const CARD = '#1e2235'
const CARD2 = '#252a3d'
const ACCENT = '#ffc20e'
const TEXT = '#f9fafb'
const MUTED = '#9ca3af'

const IMAGE_HEIGHT = 300

// Mock reviewer names for the "Reviews" row
const MOCK_REVIEWERS = ['Alex', 'Sarah', 'Mike', 'Emma', '+20']

export default function ProductDetailScreen() {
  const { id: productId } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { addToCart, updateQuantity } = useCart()
  // The Add-to-Cart bar is absolutely positioned at bottom: 0, and Android
  // edge-to-edge (SDK 54) draws that under the system nav bar. Pad by the
  // real inset instead of the hardcoded guess that used to be here.
  const insets = useSafeAreaInsets()

  const [quantity, setQuantity] = useState(1)
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const productQuery = useProduct(productId)
  const vendorQuery = useVendor(productQuery.data?.vendor_id)
  const recommendedQuery = useVendorProducts(productQuery.data?.vendor_id)
  const storeCategories = useStoreCategories()
  const storeCategory = storeCategories.data?.find(
    (c) => c.id === vendorQuery.data?.store_category_id
  )
  const accentColor =
    storeCategory?.accent_color ?? templateStyleFor(storeCategory?.template_kind).accentColor
  const accent = accentColor ?? ACCENT

  const isLoading = productQuery.isLoading || (productQuery.data && vendorQuery.isLoading)
  const isError = productQuery.isError || vendorQuery.isError

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={accent} size="large" />
      </SafeAreaView>
    )
  }

  if (isError || !productQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          {t('product.error', 'Failed to load product details')}
        </Text>
        <Pressable
          onPress={() => { void productQuery.refetch(); void vendorQuery.refetch() }}
          style={{ backgroundColor: accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: '#1a1a1a', fontWeight: '700' }}>{t('common.retry', 'Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const product = productQuery.data
  const vendor = vendorQuery.data
  const hasStock = product.stock > 0
  const recommended = (recommendedQuery.data ?? []).filter(
    (p) => p.is_active && p.id !== product.id
  ).slice(0, 6)

  const handleAddToCart = () => {
    if (!hasStock || !vendor) return
    addToCart({
      id: product.id,
      name: productDisplayName(product, i18n.language),
      priceUsd: product.price_usd,
      vendorId: vendor.id,
      vendorName: vendorDisplayName(vendor, i18n.language),
      imageUrl: product.images[0]?.url,
    })
    if (quantity > 1) updateQuantity(product.id, quantity)
    router.back()
  }

  const mainImageUrl = resolveMediaUrl(product.images[0]?.url)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={[]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── Full-width Food Image ── */}
        <View style={{ height: IMAGE_HEIGHT, backgroundColor: CARD, position: 'relative' }}>
          {product.images.length > 0 ? (
            <FlatList
              data={product.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(img) => img.id}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                )
                setActiveImageIndex(idx)
              }}
              renderItem={({ item }) => (
                <View style={{ width: 400, height: IMAGE_HEIGHT }}>
                  <Image
                    source={{ uri: resolveMediaUrl(item.url) ?? mainImageUrl ?? '' }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              )}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="image" size={64} color="#374151" />
            </View>
          )}

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>

          {/* Image pagination dots */}
          {product.images.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {product.images.map((_, idx) => (
                <View
                  key={idx}
                  style={{
                    height: 6,
                    width: activeImageIndex === idx ? 18 : 6,
                    borderRadius: 3,
                    backgroundColor: activeImageIndex === idx ? accent : 'rgba(255,255,255,0.5)',
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Info Card (overlaps image) ── */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: -32,
            backgroundColor: CARD,
            borderRadius: 28,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Vendor tag */}
          {vendor && (
            <Text style={{ fontSize: 11, fontWeight: '700', color: accent, marginBottom: 6 }}>
              {vendorDisplayName(vendor, i18n.language)}
            </Text>
          )}

          {/* Product name + price row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: TEXT, flex: 1 }}>
              {productDisplayName(product, i18n.language)}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: accent, flexShrink: 0 }}>
              ${product.price_usd.toFixed(2)}
            </Text>
          </View>

          {/* Stock badge */}
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 5,
              backgroundColor: hasStock ? '#16a34a22' : '#ef444422',
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: hasStock ? '#4ade80' : '#f87171' }}>
              {hasStock ? t('product.inStock', 'In Stock') : t('product.outOfStock', 'Out of Stock')}
            </Text>
          </View>

          {/* Description */}
          <Text style={{ fontSize: 13, color: MUTED, lineHeight: 20, marginBottom: 16 }}>
            {productDisplayDescription(product, i18n.language) ||
              t('product.noDescription', 'Fresh, delicious, and made to perfection. Order now for fast delivery to your door.')}
          </Text>

          {/* ── Reviews row ── */}
          <View style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>
                {t('product.reviews', 'Reviews')}
              </Text>
              {/* Star row */}
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Feather key={s} name="star" size={13} color={s <= 4 ? accent : '#374151'} />
                ))}
                <Text style={{ fontSize: 12, color: MUTED, marginLeft: 4 }}>4.0 (120)</Text>
              </View>
            </View>

            {/* Mock reviewer avatars */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {MOCK_REVIEWERS.map((name, i) => (
                <View
                  key={i}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: i === MOCK_REVIEWERS.length - 1 ? accent : CARD2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: BG,
                    marginLeft: i > 0 ? -10 : 0,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: i === MOCK_REVIEWERS.length - 1 ? '#1a1a1a' : MUTED,
                    }}
                  >
                    {name.charAt(0)}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>
                120 {t('product.reviewers', 'reviews')}
              </Text>
            </View>
          </View>
        </View>

        {/* ── We Recommend ── */}
        {recommended.length > 0 && (
          <View style={{ marginTop: 24, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT }}>
                {t('product.recommended', 'We recommend')}
              </Text>
            </View>
            <FlatList
              data={recommended}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const imgUrl = resolveMediaUrl(item.images[0]?.url)
                return (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/product/[id]', params: { id: item.id } })
                    }
                    style={{
                      width: 130,
                      borderRadius: 18,
                      backgroundColor: CARD,
                      overflow: 'hidden',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <View style={{ height: 90, backgroundColor: CARD2 }}>
                      {imgUrl ? (
                        <Image
                          source={{ uri: imgUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="image" size={28} color="#374151" />
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 8, gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT }} numberOfLines={1}>
                        {productDisplayName(item, i18n.language)}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>
                        ${item.price_usd.toFixed(2)}
                      </Text>
                    </View>
                  </Pressable>
                )
              }}
            />
          </View>
        )}

        {/* Bottom spacing for add-to-cart bar — must clear the bar AND the
            system nav bar the bar now pads for. */}
        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* ── Bottom Action Bar ── */}
      {hasStock && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: CARD,
            paddingHorizontal: 20,
            paddingBottom: 16 + insets.bottom,
            paddingTop: 16,
            flexDirection: 'row',
            gap: 14,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 12,
          }}
        >
          {/* Quantity stepper */}
          <View
            style={{
              borderRadius: 16,
              backgroundColor: CARD2,
              paddingHorizontal: 4,
              paddingVertical: 2,
            }}
          >
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={product.stock}
            />
          </View>

          {/* Add to Cart button */}
          <Pressable
            onPress={handleAddToCart}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 18,
              paddingVertical: 16,
              backgroundColor: accent,
              shadowColor: accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1a1a1a' }}>
              {t('product.addToCart', 'Add to Cart')}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}
