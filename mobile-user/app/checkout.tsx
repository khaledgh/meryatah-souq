import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as Location from 'expo-location'

import { Button } from '../src/components/ui/button'
import { TextField } from '../src/components/ui/text-field'
import { useCart } from '../src/features/cart/cart-context'
import { useDeliveryLocation } from '../src/features/location/delivery-location-context'
import { useVendor } from '../src/features/vendor/use-vendor'
import { useAvailableSlots } from '../src/features/checkout/use-available-slots'
import { usePlaceOrder } from '../src/features/checkout/use-place-order'
import { toApiError } from '../src/lib/api-client'

export default function CheckoutScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { items, subtotal, clearCart } = useCart()
  const params = useLocalSearchParams<{ pickedLat?: string; pickedLng?: string; pickedAddress?: string }>()

  const [address, setAddress] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [couponCode, setCouponCode] = useState('')

  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  // Seed from the delivery location the user already set on the home screen —
  // they shouldn't have to pick it a second time here. Still fully editable:
  // the GPS button and the map picker both overwrite it below.
  const { location: deliveryLocation, isResolved: hasDeliveryLocation } = useDeliveryLocation()

  useEffect(() => {
    if (!hasDeliveryLocation) return
    setLatitude((current) => current ?? deliveryLocation.latitude)
    setLongitude((current) => current ?? deliveryLocation.longitude)
    if (deliveryLocation.address) {
      setAddress((current) => current || deliveryLocation.address || '')
    }
  }, [hasDeliveryLocation, deliveryLocation])

  // Consumes the pin the user placed on /location-picker (blueprint §11.C9
  // accuracy: refines the raw GPS fetch below with a user-confirmed exact
  // point), then immediately clears the picked* params via setParams — if
  // they stayed set, remounting this screen while still on the same route
  // (e.g. returning to it from a child screen) would re-fire this effect
  // and silently overwrite any address the user had since hand-edited.
  useEffect(() => {
    if (params.pickedLat && params.pickedLng) {
      setLatitude(Number(params.pickedLat))
      setLongitude(Number(params.pickedLng))
      if (params.pickedAddress) {
        setAddress(params.pickedAddress)
      }
      router.setParams({ pickedLat: undefined, pickedLng: undefined, pickedAddress: undefined })
    }
  }, [params.pickedLat, params.pickedLng, params.pickedAddress])

  const openLocationPicker = () => {
    router.push({
      pathname: '/location-picker',
      params:
        latitude != null && longitude != null
          ? { lat: String(latitude), lng: String(longitude) }
          : {},
    })
  }

  const placeOrder = usePlaceOrder()

  const firstItem = items[0]
  const vendorId = firstItem?.vendorId
  const vendorQuery = useVendor(vendorId)
  const slotsQuery = useAvailableSlots(vendorId)

  const isSchedulingSupported =
    vendorQuery.data?.scheduling_allowed && vendorQuery.data?.scheduling_enabled

  const handleGetLocation = async () => {
    setLocationLoading(true)
    setLocationError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        const errorMsg = t('checkout.locationPermissionDenied', 'Permission to access location was denied')
        setLocationError(errorMsg)
        Alert.alert(t('common.error', 'Error'), errorMsg)
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      setLatitude(loc.coords.latitude)
      setLongitude(loc.coords.longitude)

      // Reverse geocode to retrieve address details
      const geocoded = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      })
      if (geocoded && geocoded.length > 0) {
        const first = geocoded[0]
        if (first) {
          const parts = [
            first.street,
            first.name,
            first.district,
            first.city,
            first.country
          ].filter(Boolean)
          if (parts.length > 0) {
            setAddress(parts.join(', '))
          }
        }
      }
    } catch (err) {
      const failMsg = err instanceof Error ? err.message : 'Failed to retrieve GPS location'
      setLocationError(failMsg)
      Alert.alert(t('common.error', 'Error'), failMsg)
    } finally {
      setLocationLoading(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!address.trim()) {
      Alert.alert(t('common.error', 'Error'), t('checkout.addressRequired', 'Please enter a delivery address'))
      return
    }

    // != null, not falsy: 0.0 is a real coordinate (the equator / prime
    // meridian), and treating it as "not set" would reject a legitimate point.
    if (latitude == null || longitude == null) {
      Alert.alert(
        t('checkout.locationGpsRequiredTitle', 'GPS Location Required'),
        t('checkout.locationGpsRequiredMsg', 'Please fetch your current GPS coordinates to ensure accurate delivery.')
      )
      return
    }

    if (isScheduled && !selectedSlot) {
      Alert.alert(t('common.error', 'Error'), t('checkout.slotRequired', 'Please select a delivery slot'))
      return
    }

    if (!vendorId) return

    try {
      const orderItems = items.map((i) => ({
        product_id: i.id,
        quantity: i.quantity,
      }))

      const result = await placeOrder.mutateAsync({
        vendor_id: vendorId,
        items: orderItems,
        delivery_longitude: longitude,
        delivery_latitude: latitude,
        scheduled_for: isScheduled && selectedSlot ? selectedSlot : undefined,
        currency_code: selectedCurrency,
        coupon_code: couponCode.trim() ? couponCode.trim() : undefined,
      })

      // Success: navigate to dedicated success screen instead of a plain Alert
      clearCart()
      router.replace({
        pathname: '/order/success',
        params: result.data?.id ? { orderId: result.data.id } : {},
      })
    } catch (err) {
      Alert.alert(t('common.error', 'Error'), toApiError(err).user_message || t('checkout.failed', 'Failed to place order'))
    }
  }

  if (items.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950 justify-center items-center p-5">
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('checkout.cartEmpty', 'Your cart is empty.')}
        </Text>
        <Button label={t('checkout.backToHome', 'Back to Home')} onPress={() => router.replace('/home')} />
      </SafeAreaView>
    )
  }

  return (
    // 'bottom' is required: this is a full-screen route with no tab bar
    // beneath it, and Android edge-to-edge (SDK 54) draws the app under the
    // system nav bar — without it the "Place Order" button sits under it.
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100" numberOfLines={1}>
          {t('checkout.title', 'Checkout')}
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView className="flex-1 px-5 py-4 gap-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Delivery Address Section */}
        <View className="gap-2">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('checkout.deliveryAddress', 'Delivery Address')}
          </Text>
          <TextField
            label={t('checkout.addressLabel', 'Address Details')}
            placeholder={t('checkout.addressPlaceholder', 'Street, Building, Apartment...')}
            value={address}
            onChangeText={setAddress}
          />
          {/* GPS Coordinates Section */}
          <View className="bg-brand-50/20 border border-brand-100 rounded-2xl p-4 mt-1 gap-3 dark:border-brand-950 dark:bg-brand-950/15">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 me-4">
                <Text className="text-xs font-black text-brand-700 dark:text-brand-400 uppercase tracking-wider">
                  {t('checkout.gpsLocation', 'GPS Location')}
                </Text>
                <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-semibold">
                  {latitude != null && longitude != null
                    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                    : t('checkout.noGpsFetched', 'No GPS location coordinates loaded')}
                </Text>
                {locationError && (
                  <Text className="text-[10px] text-red-500 mt-0.5">{locationError}</Text>
                )}
              </View>
              <Pressable
                onPress={handleGetLocation}
                disabled={locationLoading}
                className="bg-brand-500 active:bg-brand-600 px-4 py-2.5 rounded-xl flex-row items-center gap-1.5"
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="map-pin" size={14} color="#fff" />
                    <Text className="text-xs font-bold text-white uppercase">
                      {t('checkout.useCurrentLoc', 'Get GPS')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
            <Pressable
              onPress={openLocationPicker}
              className="flex-row items-center justify-center gap-1.5 border border-brand-300 rounded-xl py-2.5 active:bg-brand-50 dark:border-brand-800"
            >
              <Feather name="map" size={14} color="#d97706" />
              <Text className="text-xs font-bold text-brand-700 dark:text-brand-400 uppercase">
                {t('checkout.chooseOnMap', 'Choose on Map')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Scheduling Section */}
        {isSchedulingSupported && (
          <View className="gap-3 mt-4">
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
              {t('checkout.deliveryOption', 'Delivery Option')}
            </Text>
            
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setIsScheduled(false)}
                className={`flex-1 flex-row items-center justify-center gap-2 border rounded-2xl py-4 active:bg-gray-50 ${
                  !isScheduled
                    ? 'border-brand-500 bg-brand-50/20'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <Feather name="clock" size={16} color={!isScheduled ? '#f59e0b' : '#6b7280'} />
                <Text className={`font-semibold text-sm ${!isScheduled ? 'text-brand-700 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {t('checkout.asap', 'As soon as possible')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setIsScheduled(true)}
                className={`flex-1 flex-row items-center justify-center gap-2 border rounded-2xl py-4 active:bg-gray-50 ${
                  isScheduled
                    ? 'border-brand-500 bg-brand-50/20'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <Feather name="calendar" size={16} color={isScheduled ? '#f59e0b' : '#6b7280'} />
                <Text className={`font-semibold text-sm ${isScheduled ? 'text-brand-700 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {t('checkout.schedule', 'Schedule for later')}
                </Text>
              </Pressable>
            </View>

            {isScheduled && (
              <View className="mt-2">
                <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase">
                  {t('checkout.selectSlot', 'Available Time Slots')}
                </Text>
                {slotsQuery.isLoading ? (
                  <ActivityIndicator color="#f59e0b" />
                ) : slotsQuery.data && slotsQuery.data.length > 0 ? (
                  <View className="gap-2">
                    {slotsQuery.data.slice(0, 5).map((slot) => {
                      const start = new Date(slot.start_at)
                      const end = new Date(slot.end_at)
                      const timeStr = `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      const isSelected = selectedSlot === slot.start_at
                      return (
                        <Pressable
                          key={slot.start_at}
                          onPress={() => setSelectedSlot(slot.start_at)}
                          className={`flex-row items-center justify-between border rounded-xl px-4 py-3 active:bg-gray-50 ${
                            isSelected
                              ? 'border-brand-500 bg-brand-50/10'
                              : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                          }`}
                        >
                          <Text className={`text-xs font-semibold ${isSelected ? 'text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {timeStr}
                          </Text>
                          {isSelected && <Feather name="check" size={16} color="#f59e0b" />}
                        </Pressable>
                      )
                    })}
                  </View>
                ) : (
                  <Text className="text-xs text-red-500">
                    {t('checkout.noSlots', 'No available slots found for this vendor')}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Currency Picker */}
        <View className="gap-2 mt-4">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('checkout.paymentCurrency', 'Payment Currency')}
          </Text>
          <View className="flex-row gap-3">
            {['USD', 'LBP'].map((code) => {
              const isSelected = selectedCurrency === code
              return (
                <Pressable
                  key={code}
                  onPress={() => setSelectedCurrency(code)}
                  className={`flex-1 items-center justify-center border rounded-2xl py-3 active:bg-gray-50 ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50/20'
                      : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                  }`}
                >
                  <Text className={`font-bold text-sm ${isSelected ? 'text-brand-700 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {code}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Coupon Code */}
        <View className="gap-2 mt-4">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('checkout.promoCode', 'Promo Code')}
          </Text>
          <TextField
            label={t('checkout.couponLabel', 'Discount Coupon')}
            placeholder={t('checkout.couponPlaceholder', 'Enter coupon code...')}
            value={couponCode}
            onChangeText={setCouponCode}
          />
        </View>

        {/* Order Summary */}
        <View className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800 gap-3">
          <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('checkout.summary', 'Order Summary')}
          </Text>
          
          <View className="gap-2">
            {items.map((item) => (
              <View key={item.id} className="flex-row justify-between">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {item.name} x {item.quantity}
                </Text>
                <Text className="text-sm text-gray-700 font-semibold dark:text-gray-300">
                  ${(item.priceUsd * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          <View className="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700 flex-row justify-between items-center">
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
              {t('checkout.total', 'Total')}
            </Text>
            <View className="items-end">
              <Text className="text-lg font-black text-brand-600 dark:text-brand-400">
                ${subtotal.toFixed(2)}
              </Text>
              {selectedCurrency === 'LBP' && (
                <Text className="text-xs text-gray-400">
                  {/* Mock static LBP exchange rate of 90,000 for display purposes */}
                  LL {(subtotal * 90000).toLocaleString()}
                </Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Place Order CTA */}
      <View className="border-t border-gray-100 p-5 bg-white dark:bg-gray-900 dark:border-gray-800">
        <Button
          label={t('checkout.confirmBtn', 'Place Order')}
          onPress={handlePlaceOrder}
          isLoading={placeOrder.isPending}
        />
      </View>
    </SafeAreaView>
  )
}
