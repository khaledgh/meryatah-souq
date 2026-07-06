import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Carousel } from '../../../src/components/ui/carousel'
import { SearchBar } from '../../../src/components/ui/search-bar'
import { useBannerAds } from '../../../src/features/home/use-banner-ads'
import { useNearbyVendors, type Coordinates, type VendorWithStatus } from '../../../src/features/home/use-nearby-vendors'
import { vendorDisplayName } from '../../../src/schemas/vendor'

const DEFAULT_LOCATION: Coordinates = { longitude: 35.5018, latitude: 33.8938 }

const CATEGORIES = [
  { id: 'all', labelKey: 'categories.all', value: null },
  { id: 'grocery', labelKey: 'categories.grocery', value: 'grocery' },
  { id: 'pharmacy', labelKey: 'categories.pharmacy', value: 'pharmacy' },
  { id: 'restaurant', labelKey: 'categories.restaurant', value: 'restaurant' },
  { id: 'clothing', labelKey: 'categories.clothing', value: 'clothing' },
]

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const nearby = useNearbyVendors(DEFAULT_LOCATION)
  const bannerAds = useBannerAds()

  // Pull-to-refresh: refetch both the vendor list and the promo banners.
  const onRefresh = useCallback(() => {
    void Promise.all([nearby.refetch(), bannerAds.refetch()])
  }, [nearby, bannerAds])

  const vendors = (nearby.data ?? []).filter((v) => {
    const matchesSearch = !search.trim() || 
      vendorDisplayName(v, i18n.language).toLowerCase().includes(search.toLowerCase())
    
    const matchesCategory = !selectedCategory || 
      v.category?.toLowerCase() === selectedCategory.toLowerCase()

    return matchesSearch && matchesCategory
  })

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Location Header */}
      <View className="px-5 pb-2 pt-2">
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {t('home.deliverTo', 'Deliver To')}
        </Text>
        <Text className="text-base font-bold text-emerald-600 dark:text-emerald-400">
          {t('home.setLocation', 'Beirut, Lebanon')}
        </Text>
      </View>

      {/* Search Bar */}
      <View className="px-5 pb-3">
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('home.searchPlaceholder', 'Search vendors...')}
        />
      </View>

      {nearby.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#10b981" size="large" />
        </View>
      ) : nearby.isError ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
            {t('common.error', 'Something went wrong')}
          </Text>
          <Pressable
            onPress={() => void nearby.refetch()}
            className="rounded-xl bg-emerald-600 px-6 py-3 active:bg-emerald-700"
          >
            <Text className="text-sm font-semibold text-white">{t('common.retry', 'Retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(v) => v.id}
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl
              refreshing={nearby.isRefetching || bannerAds.isRefetching}
              onRefresh={onRefresh}
              tintColor="#10b981"
              colors={['#10b981']}
            />
          }
          ListHeaderComponent={
            <View className="gap-5">
              {/* Promo Banner Carousel — from the API; hidden when there are
                  no active ads so we never render an empty band. */}
              {bannerAds.data && bannerAds.data.length > 0 ? (
                <Carousel data={bannerAds.data} />
              ) : null}

              {/* Categories Scroll */}
              <View>
                <Text className="px-5 text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('home.categories', 'Categories')}
                </Text>
                <FlatList
                  data={CATEGORIES}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isSelected = selectedCategory === item.value
                    return (
                      <Pressable
                        onPress={() => setSelectedCategory(item.value)}
                        className={`mr-2.5 rounded-full px-5 py-2 border ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {t(item.labelKey, item.id.toUpperCase())}
                        </Text>
                      </Pressable>
                    )
                  }}
                />
              </View>

              <Text className="px-5 text-lg font-bold text-gray-900 dark:text-gray-100 mt-2 mb-[-8px]">
                {t('home.nearby', 'Nearby Stores')}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-10">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {t('home.noVendors', 'No stores found nearby')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="px-5 pt-3">
              <VendorCard
                vendor={item}
                onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: item.id } })}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function VendorCard({ vendor, onPress }: { vendor: VendorWithStatus; onPress: () => void }) {
  const { t, i18n } = useTranslation()
  const isOpen = vendor.openStatus?.IsOpen ?? false
  const km = vendor.distance_meters != null ? (vendor.distance_meters / 1000).toFixed(1) : null

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-3xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
    >
      <View className="size-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30">
        <Text className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
          {vendorDisplayName(vendor, i18n.language).charAt(0).toUpperCase()}
        </Text>
      </View>
      
      <View className="flex-1">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {vendorDisplayName(vendor, i18n.language)}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" numberOfLines={1}>
          {t(`categories.${vendor.category?.toLowerCase()}`, vendor.category)}
          {km ? ` · ${t('home.kmAway', { km, defaultValue: `${km} km away` })}` : ''}
        </Text>
      </View>
      
      <View className={`rounded-full px-3 py-1 ${isOpen ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
        <Text className={`text-xs font-bold ${isOpen ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {isOpen ? t('home.open', 'Open') : t('home.closed', 'Closed')}
        </Text>
      </View>
    </Pressable>
  )
}
