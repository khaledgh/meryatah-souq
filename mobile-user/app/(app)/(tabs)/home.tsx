import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Carousel } from '../../../src/components/ui/carousel'
import { SearchBar } from '../../../src/components/ui/search-bar'
import { useBannerAds } from '../../../src/features/home/use-banner-ads'
import { useNearbyVendors, type Coordinates, type VendorWithStatus } from '../../../src/features/home/use-nearby-vendors'
import { useStoreCategories } from '../../../src/features/home/use-store-categories'
import { resolveMediaUrl } from '../../../src/lib/media'
import { storeCategoryDisplayName, type StoreCategory } from '../../../src/schemas/store-category'
import { vendorDisplayName } from '../../../src/schemas/vendor'

const DEFAULT_LOCATION: Coordinates = { longitude: 35.5018, latitude: 33.8938 }

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const nearby = useNearbyVendors(DEFAULT_LOCATION)
  const bannerAds = useBannerAds()
  const storeCategories = useStoreCategories()

  // Pull-to-refresh: refetch everything the screen renders.
  const onRefresh = useCallback(() => {
    void Promise.all([nearby.refetch(), bannerAds.refetch(), storeCategories.refetch()])
  }, [nearby, bannerAds, storeCategories])

  const vendors = (nearby.data ?? []).filter((v) => {
    if (!search.trim()) return true
    return vendorDisplayName(v, i18n.language).toLowerCase().includes(search.toLowerCase())
  })

  const openSection = (category: StoreCategory) => {
    router.push({ pathname: '/section/[storeCategoryId]', params: { storeCategoryId: category.id } })
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Location Header */}
      <View className="px-5 pb-2 pt-2">
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {t('home.deliverTo', 'Deliver To')}
        </Text>
        <Text className="text-base font-bold text-brand-600 dark:text-brand-400">
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
          <ActivityIndicator color="#f59e0b" size="large" />
        </View>
      ) : nearby.isError ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
            {t('common.error', 'Something went wrong')}
          </Text>
          <Pressable
            onPress={() => void nearby.refetch()}
            className="rounded-xl bg-brand-600 px-6 py-3 active:bg-brand-700"
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
              refreshing={nearby.isRefetching || bannerAds.isRefetching || storeCategories.isRefetching}
              onRefresh={onRefresh}
              tintColor="#f59e0b"
              colors={['#f59e0b']}
            />
          }
          ListHeaderComponent={
            <View className="gap-5">
              {/* Promo Banner Carousel — from the API; hidden when there are
                  no active ads so we never render an empty band. */}
              {bannerAds.data && bannerAds.data.length > 0 ? (
                <Carousel data={bannerAds.data} />
              ) : null}

              {/* Marketplace sections — admin-managed store categories.
                  Tapping one enters that section's own template + accent
                  (Phase F3/F4), not a client-side filter of this list. */}
              {storeCategories.data && storeCategories.data.length > 0 ? (
                <View>
                  <Text className="px-5 text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {t('home.categories', 'Categories')}
                  </Text>
                  <FlatList
                    data={storeCategories.data}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <SectionTile category={item} onPress={() => { openSection(item) }} />}
                  />
                </View>
              ) : null}

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

function SectionTile({ category, onPress }: { category: StoreCategory; onPress: () => void }) {
  const { t, i18n } = useTranslation()
  const iconUrl = resolveMediaUrl(category.icon_url)
  const name = storeCategoryDisplayName(category, i18n.language) || t(`categories.${category.slug}`, category.slug)

  return (
    <Pressable onPress={onPress} className="mr-3 items-center gap-1.5" style={{ width: 76 }}>
      <View
        className="size-16 items-center justify-center rounded-2xl border border-gray-100 bg-brand-50 dark:border-gray-800 dark:bg-brand-950/30"
        style={category.accent_color ? { backgroundColor: `${category.accent_color}1a`, borderColor: `${category.accent_color}33` } : undefined}
      >
        {iconUrl ? (
          <Image source={{ uri: iconUrl }} className="size-9" resizeMode="contain" />
        ) : (
          <Text
            className="text-xl font-bold text-brand-600 dark:text-brand-400"
            style={category.accent_color ? { color: category.accent_color } : undefined}
          >
            {name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <Text
        className="text-xs font-semibold text-gray-700 dark:text-gray-300 text-center"
        numberOfLines={1}
      >
        {name}
      </Text>
    </Pressable>
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
      <View className="size-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/30">
        <Text className="text-xl font-bold text-brand-600 dark:text-brand-400">
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

      <View className={`rounded-full px-3 py-1 ${isOpen ? 'bg-brand-100 dark:bg-brand-950/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
        <Text className={`text-xs font-bold ${isOpen ? 'text-brand-700 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {isOpen ? t('home.open', 'Open') : t('home.closed', 'Closed')}
        </Text>
      </View>
    </Pressable>
  )
}
