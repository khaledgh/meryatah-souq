import { Feather } from '@expo/vector-icons'
import { Camera, type CameraRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View, type NativeSyntheticEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { MapView } from '../src/components/map/map-view'
import { Button } from '../src/components/ui/button'

// Beirut — only used when we have neither a previously-picked point nor a GPS
// fix, so the map opens somewhere plausible rather than at [0,0].
const FALLBACK_CENTER: [number, number] = [35.5018, 33.8938]

interface Coords {
  longitude: number
  latitude: number
}

// Blueprint §11.C9 checkout accuracy: a raw GPS fix can be off by 10-50m in
// dense areas — enough to send a driver to the wrong building. This screen
// lets the user place the exact drop pin.
//
// The pin is fixed to the centre of the screen and the map moves beneath it
// (rather than dragging a marker around): it keeps the target under the
// user's thumb instead of under their finger, and it's the interaction every
// ride-hailing/delivery app has trained people to expect.
export default function LocationPickerScreen() {
  const { t } = useTranslation()
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>()
  const cameraRef = useRef<CameraRef>(null)

  const initialLat = params.lat != null ? Number(params.lat) : null
  const initialLng = params.lng != null ? Number(params.lng) : null
  const hasInitial =
    initialLat != null && initialLng != null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)

  const initialCenter: [number, number] = hasInitial
    ? [initialLng as number, initialLat as number]
    : FALLBACK_CENTER

  // The picked point is wherever the map is currently centred.
  const [picked, setPicked] = useState<Coords>({
    longitude: initialCenter[0],
    latitude: initialCenter[1],
  })
  const [locating, setLocating] = useState(false)
  const [resolving, setResolving] = useState(false)

  const onRegionChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const [longitude, latitude] = event.nativeEvent.center
    setPicked({ longitude, latitude })
  }, [])

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
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      cameraRef.current?.flyTo({
        center: [fix.coords.longitude, fix.coords.latitude],
        zoom: 16,
        duration: 600,
      })
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
        const geocoded = await Location.reverseGeocodeAsync(picked)
        const first = geocoded[0]
        if (first) {
          address = [first.street, first.name, first.district, first.city, first.country]
            .filter(Boolean)
            .join(', ')
        }
      } catch {
        // Reverse geocoding is best-effort: the pin coordinates are what
        // actually get the driver to the door, so a failed lookup still lets
        // the user proceed with just the point and no prefilled address.
      }
      router.replace({
        pathname: '/checkout',
        params: {
          pickedLat: String(picked.latitude),
          pickedLng: String(picked.longitude),
          pickedAddress: address,
        },
      })
    } finally {
      setResolving(false)
    }
  }, [picked])

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
        <MapView style={{ flex: 1 }} onRegionDidChange={onRegionChange}>
          <Camera
            ref={cameraRef}
            initialViewState={{ center: initialCenter, zoom: hasInitial ? 16 : 12 }}
          />
        </MapView>

        {/* The pin is a static overlay, not a map annotation: it marks the
            centre of the viewport, which IS the selected point. Offset up by
            half its height so the tip, not the middle, sits on the centre. */}
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <View className="-mt-8 items-center">
            <View
              className="size-9 items-center justify-center rounded-full border-2 border-white"
              style={{
                backgroundColor: '#ffc20e',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <Feather name="map-pin" size={17} color="#ffffff" />
            </View>
            <View className="h-3 w-0.5 bg-gray-800/60" />
          </View>
        </View>

        <Text className="absolute top-3 self-center bg-black/60 rounded-full px-3 py-1.5 text-[11px] text-white font-semibold">
          {t('locationPicker.hint', 'Move the map to your exact location')}
        </Text>

        <Pressable
          onPress={() => void useMyLocation()}
          disabled={locating}
          className="absolute bottom-4 end-4 rounded-full bg-white p-3 dark:bg-gray-900"
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
          {picked.latitude.toFixed(6)}, {picked.longitude.toFixed(6)}
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
