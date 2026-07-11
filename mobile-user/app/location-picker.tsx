import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as Location from 'expo-location'
import MapView, { Marker, type Region } from 'react-native-maps'

import { Button } from '../src/components/ui/button'

const DEFAULT_REGION: Region = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
}

// Blueprint §11.C9 checkout accuracy: GPS alone (getCurrentPositionAsync)
// can be off by 10-50m in dense urban areas, enough to misdirect a driver
// to the wrong building. This screen lets the user drag/tap-refine the
// exact drop pin on a map after the GPS fetch, matching the accuracy a
// driver-facing map (mobile-driver D4) needs to actually find the door.
export default function LocationPickerScreen() {
  const { t } = useTranslation()
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>()

  const initialLat = params.lat ? Number(params.lat) : null
  const initialLng = params.lng ? Number(params.lng) : null

  const [region, setRegion] = useState<Region>(
    initialLat != null && initialLng != null
      ? { ...DEFAULT_REGION, latitude: initialLat, longitude: initialLng }
      : DEFAULT_REGION,
  )
  const [marker, setMarker] = useState({
    latitude: region.latitude,
    longitude: region.longitude,
  })
  const [locating, setLocating] = useState(false)
  const [resolving, setResolving] = useState(false)
  const mapRef = useRef<MapView>(null)

  const useMyLocation = useCallback(async () => {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          t('common.error', 'Error'),
          t('checkout.locationPermissionDenied', 'Permission to access location was denied'),
        )
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setMarker(next)
      mapRef.current?.animateToRegion({ ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400)
    } catch {
      Alert.alert(t('common.error', 'Error'), t('locationPicker.gpsFailed', 'Could not get your current location'))
    } finally {
      setLocating(false)
    }
  }, [t])

  const confirm = useCallback(async () => {
    setResolving(true)
    try {
      let address = ''
      try {
        const geocoded = await Location.reverseGeocodeAsync(marker)
        const first = geocoded[0]
        if (first) {
          address = [first.street, first.name, first.district, first.city, first.country]
            .filter(Boolean)
            .join(', ')
        }
      } catch {
        // Reverse geocoding is best-effort — the pin coordinates are the
        // source of truth for delivery accuracy, so a failed lookup still
        // lets the user proceed with just lat/lng and no prefilled address.
      }
      router.replace({
        pathname: '/checkout',
        params: {
          pickedLat: String(marker.latitude),
          pickedLng: String(marker.longitude),
          pickedAddress: address,
        },
      })
    } finally {
      setResolving(false)
    }
  }, [marker])

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
          {t('locationPicker.title', 'Set Delivery Location')}
        </Text>
        <View className="w-8" />
      </View>

      <View className="flex-1">
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={region}
          onRegionChangeComplete={setRegion}
          onPress={(e) => setMarker(e.nativeEvent.coordinate)}
        >
          <Marker
            coordinate={marker}
            draggable
            onDragEnd={(e) => setMarker(e.nativeEvent.coordinate)}
            pinColor="#ffc20e"
          />
        </MapView>

        <Text className="absolute top-3 self-center bg-black/60 rounded-full px-3 py-1.5 text-[11px] text-white font-semibold">
          {t('locationPicker.hint', 'Tap or drag the pin to your exact location')}
        </Text>

        <Pressable
          onPress={() => void useMyLocation()}
          disabled={locating}
          className="absolute bottom-28 end-4 bg-white dark:bg-gray-900 rounded-full p-3 shadow-md active:opacity-80"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#ffc20e" />
          ) : (
            <Feather name="crosshair" size={20} color="#374151" />
          )}
        </Pressable>
      </View>

      <View className="border-t border-gray-100 p-5 bg-white dark:bg-gray-900 dark:border-gray-800 gap-2">
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
        </Text>
        <Button
          label={t('locationPicker.confirm', 'Confirm Location')}
          onPress={() => void confirm()}
          isLoading={resolving}
        />
      </View>
    </SafeAreaView>
  )
}
