import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { Button } from '../../src/components/ui/button'
import { QuantityStepper } from '../../src/components/ui/quantity-stepper'
import { resolveMediaUrl } from '../../src/lib/media'
import { useCart } from '../../src/features/cart/cart-context'
import { useStoreCategories } from '../../src/features/home/use-store-categories'
import { useProduct, useVendor } from '../../src/features/vendor/use-vendor'
import { vendorDisplayName } from '../../src/schemas/vendor'
import { productDisplayName, productDisplayDescription } from '../../src/schemas/product'
import { templateStyleFor } from '../../src/theme/template-kinds'

export default function ProductDetailScreen() {
  const { id: productId } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { addToCart, updateQuantity } = useCart()

  const [quantity, setQuantity] = useState(1)

  const productQuery = useProduct(productId)
  // Fetch vendor once product is loaded to get vendor name
  const vendorQuery = useVendor(productQuery.data?.vendor_id)
  const storeCategories = useStoreCategories()
  const storeCategory = storeCategories.data?.find((c) => c.id === vendorQuery.data?.store_category_id)
  const accentColor = storeCategory?.accent_color ?? templateStyleFor(storeCategory?.template_kind).accentColor

  const isLoading = productQuery.isLoading || (productQuery.data && vendorQuery.isLoading)
  const isError = productQuery.isError || vendorQuery.isError

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center">
        <ActivityIndicator color={accentColor} size="large" />
      </SafeAreaView>
    )
  }

  if (isError || !productQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center p-5">
        <Text className="text-sm text-red-600 dark:text-red-400 mb-4">{t('product.error', 'Failed to load product details')}</Text>
        <Button label={t('common.retry', 'Retry')} onPress={() => {
          void productQuery.refetch()
          void vendorQuery.refetch()
        }} />
      </SafeAreaView>
    )
  }

  const product = productQuery.data
  const vendor = vendorQuery.data
  const hasStock = product.stock > 0

  const handleAddToCart = () => {
    if (!hasStock || !vendor) return
    
    // Add first item, then update quantity to match selected
    addToCart({
      id: product.id,
      name: productDisplayName(product, i18n.language),
      priceUsd: product.price_usd,
      vendorId: vendor.id,
      vendorName: vendorDisplayName(vendor, i18n.language),
      imageUrl: product.images[0]?.url,
    })
    
    // If quantity is more than 1, set the exact quantity
    if (quantity > 1) {
      updateQuantity(product.id, quantity)
    }
    
    router.back()
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {t('product.details', 'Product Details')}
        </Text>
        <View className="w-8" />
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View className="pb-10">
            {/* Image Gallery */}
            <View className="w-full h-72 bg-gray-50 dark:bg-gray-900 items-center justify-center relative">
              {product.images.length > 0 ? (
                <FlatList
                  data={product.images}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(img) => img.id}
                  renderItem={({ item }) => (
                    <View style={{ width: 400, height: 288 }} className="items-center justify-center">
                      <Image source={{ uri: resolveMediaUrl(item.url) }} className="w-full h-full" resizeMode="contain" />
                    </View>
                  )}
                />
              ) : (
                <Feather name="image" size={64} color="#d1d5db" />
              )}
            </View>

            {/* Product info */}
            <View className="p-5 gap-4">
              <View>
                {vendor && (
                  <Text className="text-xs font-bold mb-1" style={{ color: accentColor }}>
                    {vendorDisplayName(vendor, i18n.language)}
                  </Text>
                )}
                <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {productDisplayName(product, i18n.language)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-2xl font-black" style={{ color: accentColor }}>
                  ${product.price_usd.toFixed(2)}
                </Text>
                
                <View className={`rounded-full px-3 py-1 ${hasStock ? 'bg-green-50 dark:bg-green-950/40' : 'bg-red-50 dark:bg-red-950/40'}`}>
                  <Text className={`text-xs font-bold ${hasStock ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {hasStock ? t('product.inStock', 'In Stock') : t('product.outOfStock', 'Out of Stock')}
                  </Text>
                </View>
              </View>

              <View className="border-t border-gray-50 pt-4 dark:border-gray-900">
                <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('product.description', 'Description')}
                </Text>
                <Text className="text-sm text-gray-600 leading-relaxed dark:text-gray-400">
                  {productDisplayDescription(product, i18n.language) || t('product.noDescription', 'No description available.')}
                </Text>
              </View>
            </View>
          </View>
        }
      />

      {/* Cart Control Bottom Bar */}
      {hasStock && (
        <View className="border-t border-gray-100 p-5 bg-white dark:bg-gray-900 dark:border-gray-800 flex-row gap-4 items-center">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={product.stock}
          />
          <View className="flex-1">
            <Button
              label={t('product.addToCart', 'Add to Cart')}
              onPress={handleAddToCart}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}
