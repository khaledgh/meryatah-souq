import { useRouter } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { SearchBar } from '../../../src/components/ui/search-bar'
import { useNearbyVendors } from '../../../src/features/home/use-nearby-vendors'
import { useUserLocation } from '../../../src/features/location/use-user-location'
import { vendorDisplayName } from '../../../src/schemas/vendor'

export default function SearchScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { location } = useUserLocation()
  const nearby = useNearbyVendors(location)

  const results = (nearby.data ?? []).filter((v) => {
    if (!query.trim()) return false
    return (
      vendorDisplayName(v, i18n.language).toLowerCase().includes(query.toLowerCase()) ||
      v.category?.toLowerCase().includes(query.toLowerCase())
    )
  })

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
          {t('search.title', 'Search')}
        </Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder', 'Search stores or categories...')}
        />
      </View>

      {query.trim().length === 0 ? (
        <View className="flex-1 items-center justify-center p-5">
          <Text className="text-sm text-gray-400 dark:text-gray-500 text-center">
            {t('search.emptyPrompt', 'Type a store name or category (e.g. grocery, restaurant) to search')}
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View className="flex-1 items-center justify-center p-5">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {t('search.noResults', 'No matching stores found')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-8"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: item.id } })}
              className="flex-row items-center gap-3 border-b border-gray-100 py-4 dark:border-gray-800"
            >
              <View className="size-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
                <Text className="text-lg font-bold text-brand-600 dark:text-brand-400">
                  {vendorDisplayName(item, i18n.language).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {vendorDisplayName(item, i18n.language)}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {t(`categories.${item.category?.toLowerCase()}`, item.category)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}
