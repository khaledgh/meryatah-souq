import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useNearbyVendors, type Coordinates, type VendorWithStatus } from '../../src/features/home/use-nearby-vendors'
import { vendorDisplayName } from '../../src/schemas/vendor'

// Default location (Beirut) until device geolocation / a location picker is
// wired (blueprint §11.C5 "change location" is a follow-up). Ordering is
// gated by open status elsewhere; closed stores still appear here.
const DEFAULT_LOCATION: Coordinates = { longitude: 35.5018, latitude: 33.8938 }

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const nearby = useNearbyVendors(DEFAULT_LOCATION)

  const vendors = (nearby.data ?? []).filter((v) => {
    if (!search.trim()) return true
    return vendorDisplayName(v, i18n.language).toLowerCase().includes(search.toLowerCase())
  })

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <View className="px-5 pb-2 pt-1">
        <Text className="text-xs text-gray-400 dark:text-gray-500">{t('home.deliverTo')}</Text>
        <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('home.setLocation')}</Text>
      </View>

      <View className="px-5 pb-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        />
      </View>

      {nearby.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#9333ea" />
        </View>
      ) : nearby.isError ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="mb-3 text-center text-sm text-red-600 dark:text-red-400">{t('common.error')}</Text>
          <Pressable onPress={() => void nearby.refetch()} className="rounded-lg bg-brand-600 px-4 py-2 active:bg-brand-700">
            <Text className="text-sm font-medium text-white">{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(v) => v.id}
          contentContainerClassName="px-5 pb-8"
          ListHeaderComponent={
            <Text className="mb-3 mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{t('home.nearby')}</Text>
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('home.noVendors')}</Text>
          }
          renderItem={({ item }) => <VendorCard vendor={item} />}
          ItemSeparatorComponent={() => <View className="h-3" />}
        />
      )}
    </SafeAreaView>
  )
}

function VendorCard({ vendor }: { vendor: VendorWithStatus }) {
  const { t, i18n } = useTranslation()
  const isOpen = vendor.openStatus?.IsOpen ?? false
  const km = vendor.distance_meters != null ? (vendor.distance_meters / 1000).toFixed(1) : null

  return (
    <Pressable className="flex-row items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      <View className="size-14 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950">
        <Text className="text-lg font-bold text-brand-600 dark:text-brand-300">
          {vendorDisplayName(vendor, i18n.language).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {vendorDisplayName(vendor, i18n.language)}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500" numberOfLines={1}>
          {vendor.category}
          {km ? ` · ${t('home.kmAway', { km })}` : ''}
        </Text>
      </View>
      <View className={`rounded-full px-2.5 py-1 ${isOpen ? 'bg-green-100 dark:bg-green-950' : 'bg-gray-100 dark:bg-gray-800'}`}>
        <Text className={`text-xs font-medium ${isOpen ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {isOpen ? t('home.open') : t('home.closed')}
        </Text>
      </View>
    </Pressable>
  )
}
