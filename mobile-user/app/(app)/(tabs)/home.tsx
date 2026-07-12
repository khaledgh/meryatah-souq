import { Feather, Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Carousel } from '../../../src/components/ui/carousel'
import { SearchBar } from '../../../src/components/ui/search-bar'
import { useBannerAds } from '../../../src/features/home/use-banner-ads'
import { useNearbyVendors, type VendorWithStatus } from '../../../src/features/home/use-nearby-vendors'
import { useStoreCategories } from '../../../src/features/home/use-store-categories'
import { resolveMediaUrl } from '../../../src/lib/media'
import { storeCategoryDisplayName, type StoreCategory } from '../../../src/schemas/store-category'
import { vendorDisplayName } from '../../../src/schemas/vendor'
import { useAuth } from '../../../src/features/auth/auth-context'
import { useDeliveryLocation } from '../../../src/features/location/delivery-location-context'

const ACCENT = '#ffc20e'
const TEXT_DARK = '#f9fafb'
const TEXT_MUTED = '#9ca3af'
const BG = '#0f111a'
const CARD = '#1e2235'

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const [search, setSearch] = useState('')

  const { location } = useDeliveryLocation()
  const nearby = useNearbyVendors(location)
  const bannerAds = useBannerAds()
  const storeCategories = useStoreCategories()

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

  const firstName = user?.first_name ?? ''

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      {nearby.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : nearby.isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            {t('common.error', 'Something went wrong')}
          </Text>
          <Pressable
            onPress={() => void nearby.refetch()}
            style={{ backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#1a1a1a', fontWeight: '700', fontSize: 13 }}>
              {t('common.retry', 'Retry')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={nearby.isRefetching || bannerAds.isRefetching || storeCategories.isRefetching}
              onRefresh={onRefresh}
              tintColor={ACCENT}
              colors={[ACCENT]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* ── YELLOW HEADER ── */}
              <View
                style={{
                  backgroundColor: ACCENT,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 32,
                  borderBottomLeftRadius: 32,
                  borderBottomRightRadius: 32,
                }}
              >
                {/* Top row: greeting + bell */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1a1a1a', fontSize: 13, fontWeight: '600' }}>
                      {firstName ? t('home.greetingName', `Hi ${firstName}`) : t('home.hiThere', 'Hi there')} 👋
                    </Text>
                    <Text style={{ color: '#1a1a1a', fontSize: 22, fontWeight: '900', marginTop: 2 }}>
                      {t('home.hungry', 'Hungry? Order & Eat.')}
                    </Text>
                  </View>
                  <Pressable
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: 'rgba(0,0,0,0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="notifications-outline" size={22} color="#1a1a1a" />
                  </Pressable>
                </View>

                {/* Location pill — opens the map picker. This used to be a
                    dead Pressable showing a hardcoded "Beirut, Lebanon" while
                    the store list was actually ranked by the device's GPS, so
                    it claimed a location the app wasn't using and gave no way
                    to change it. */}
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/location-picker',
                      params: {
                        mode: 'delivery',
                        lat: String(location.latitude),
                        lng: String(location.longitude),
                      },
                    })
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    alignSelf: 'flex-start',
                    backgroundColor: 'rgba(0,0,0,0.10)',
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    marginBottom: 18,
                    marginTop: 6,
                    maxWidth: '100%',
                  }}
                >
                  <Feather name="map-pin" size={12} color="#1a1a1a" />
                  <Text
                    numberOfLines={1}
                    style={{ color: '#1a1a1a', fontSize: 12, fontWeight: '700', flexShrink: 1 }}
                  >
                    {location.address ?? t('home.setLocation')}
                  </Text>
                  <Feather name="chevron-down" size={12} color="#1a1a1a" />
                </Pressable>

                {/* Search bar */}
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('home.searchPlaceholder', 'Search food, stores...')}
                  showFilter
                />
              </View>

              {/* ── BANNER CAROUSEL ── */}
              {bannerAds.data && bannerAds.data.length > 0 && (
                <View style={{ marginTop: 20, marginBottom: 8 }}>
                  <Carousel data={bannerAds.data} />
                </View>
              )}

              {/* ── STORE CATEGORIES ── */}
              {storeCategories.data && storeCategories.data.length > 0 && (
                <View style={{ marginTop: 20, marginBottom: 8 }}>
                  <SectionHeader title={t('home.categories', 'Main Categories')} />
                  <FlatList
                    data={storeCategories.data}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <CategoryTile category={item} onPress={() => openSection(item)} />
                    )}
                  />
                </View>
              )}

              {/* ── NEARBY STORES heading ── */}
              <View style={{ marginTop: 20 }}>
                <SectionHeader
                  title={t('home.nearby', 'Nearby Stores')}
                  onSeeAll={() => {}}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
              <Feather name="map-pin" size={36} color="#d1d5db" />
              <Text style={{ color: TEXT_MUTED, fontSize: 13, marginTop: 12 }}>
                {t('home.noVendors', 'No stores found nearby')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
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

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { t } = useTranslation()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: TEXT_DARK }}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT }}>{t('common.seeAll', 'See All')}</Text>
        </Pressable>
      )}
    </View>
  )
}

function CategoryTile({ category, onPress }: { category: StoreCategory; onPress: () => void }) {
  const { i18n } = useTranslation()
  const iconUrl = resolveMediaUrl(category.icon_url)
  const name = storeCategoryDisplayName(category, i18n.language) || category.slug
  const accent = category.accent_color ?? ACCENT

  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 18,
          backgroundColor: `${accent}22`,
          borderWidth: 1.5,
          borderColor: `${accent}55`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {iconUrl ? (
          <Image source={{ uri: iconUrl }} style={{ width: 34, height: 34 }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 22, fontWeight: '900', color: accent }}>
            {name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textAlign: 'center' }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  )
}

function VendorCard({ vendor, onPress }: { vendor: VendorWithStatus; onPress: () => void }) {
  const { t, i18n } = useTranslation()
  const isOpen = vendor.openStatus?.IsOpen ?? false
  const km = vendor.distance_meters != null ? (vendor.distance_meters / 1000).toFixed(1) : null
  const logoUrl = resolveMediaUrl(vendor.logo_url)
  const accent = ACCENT

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: CARD,
        borderRadius: 20,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: '#252b44',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={{ fontSize: 22, fontWeight: '800', color: accent }}>
            {vendorDisplayName(vendor, i18n.language).charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT_DARK }} numberOfLines={1}>
          {vendorDisplayName(vendor, i18n.language)}
        </Text>
        <Text style={{ fontSize: 12, color: TEXT_MUTED }} numberOfLines={1}>
          {t(`categories.${vendor.category?.toLowerCase()}`, vendor.category ?? '')}
          {km ? ` · ${km} km` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="star" size={11} color={ACCENT} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_DARK }}>4.8</Text>
          <Text style={{ fontSize: 11, color: TEXT_MUTED }}>· 20-30 min</Text>
        </View>
      </View>

      <View
        style={{
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: isOpen ? '#16a34a22' : '#252b44',
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: isOpen ? '#4ade80' : TEXT_MUTED }}>
          {isOpen ? t('home.open', 'Open') : t('home.closed', 'Closed')}
        </Text>
      </View>
    </Pressable>
  )
}
