import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useNearbyVendors, type VendorWithStatus } from '../../src/features/home/use-nearby-vendors'
import { useUserLocation } from '../../src/features/location/use-user-location'
import { useStoreCategories } from '../../src/features/home/use-store-categories'
import { storeCategoryDisplayName, type StoreCategory } from '../../src/schemas/store-category'
import { vendorDisplayName } from '../../src/schemas/vendor'
import { ThemeProvider, useTheme } from '../../src/theme/theme-context'


// A marketplace section's landing page: entering a store category (Food,
// Electronics, Market, ...) applies that section's accent + template
// (blueprint marketplace taxonomy) and lists only vendors in that section,
// filtered server-side. The category list is already cached from the home
// screen's useStoreCategories() call, so this looks it up by id instead of
// making a second round-trip for a single category.
export default function SectionScreen() {
  const { storeCategoryId } = useLocalSearchParams<{ storeCategoryId: string }>()
  const storeCategories = useStoreCategories()
  const category = storeCategories.data?.find((c) => c.id === storeCategoryId)

  return (
    <ThemeProvider templateKind={category?.template_kind} accentColor={category?.accent_color}>
      <SectionContent storeCategoryId={storeCategoryId} category={category} />
    </ThemeProvider>
  )
}

function SectionContent({ storeCategoryId, category }: { storeCategoryId: string; category?: StoreCategory }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const theme = useTheme()
  const { location } = useUserLocation()
  const nearby = useNearbyVendors(location, storeCategoryId)
  const categoryName = category ? storeCategoryDisplayName(category, i18n.language) : undefined

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {categoryName ?? t('section.title', 'Section')}
        </Text>
      </View>

      {nearby.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accentColor} size="large" />
        </View>
      ) : nearby.isError ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
            {t('common.error', 'Something went wrong')}
          </Text>
          <Pressable
            onPress={() => void nearby.refetch()}
            className="rounded-xl px-6 py-3"
            style={{ backgroundColor: theme.accentColor }}
          >
            <Text className="text-sm font-semibold text-white">{t('common.retry', 'Retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={nearby.data ?? []}
          keyExtractor={(v) => v.id}
          contentContainerClassName="px-5 pt-3 pb-8 gap-3"
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {t('section.noVendors', 'No stores in this section nearby')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SectionVendorCard
              vendor={item}
              accentColor={theme.accentColor}
              locale={i18n.language}
              onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

function SectionVendorCard({
  vendor,
  accentColor,
  locale,
  onPress,
}: {
  vendor: VendorWithStatus
  accentColor: string
  locale: string
  onPress: () => void
}) {
  const { t } = useTranslation()
  const isOpen = vendor.openStatus?.IsOpen ?? false
  const km = vendor.distance_meters != null ? (vendor.distance_meters / 1000).toFixed(1) : null

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-3xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
    >
      <View className="size-16 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accentColor}1a` }}>
        <Text className="text-xl font-bold" style={{ color: accentColor }}>
          {vendorDisplayName(vendor, locale).charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {vendorDisplayName(vendor, locale)}
        </Text>
        {km ? (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t('home.kmAway', { km, defaultValue: `${km} km away` })}
          </Text>
        ) : null}
      </View>

      <View className={`rounded-full px-3 py-1 ${isOpen ? '' : 'bg-gray-100 dark:bg-gray-800'}`} style={isOpen ? { backgroundColor: `${accentColor}22` } : undefined}>
        <Text className="text-xs font-bold" style={{ color: isOpen ? accentColor : undefined }}>
          {isOpen ? t('home.open', 'Open') : t('home.closed', 'Closed')}
        </Text>
      </View>
    </Pressable>
  )
}
