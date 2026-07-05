import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { Button } from '../src/components/ui/button'
import { TextField } from '../src/components/ui/text-field'
import { useCart } from '../src/features/cart/cart-context'
import { useVendor } from '../src/features/vendor/use-vendor'
import { useAvailableSlots } from '../src/features/checkout/use-available-slots'
import { usePlaceOrder } from '../src/features/checkout/use-place-order'

export default function CheckoutScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { items, subtotal, clearCart } = useCart()

  const [address, setAddress] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [couponCode, setCouponCode] = useState('')

  const placeOrder = usePlaceOrder()

  const firstItem = items[0]
  const vendorId = firstItem?.vendorId
  const vendorQuery = useVendor(vendorId)
  const slotsQuery = useAvailableSlots(vendorId)

  const isSchedulingSupported =
    vendorQuery.data?.scheduling_allowed && vendorQuery.data?.scheduling_enabled

  const handlePlaceOrder = async () => {
    if (!address.trim()) {
      Alert.alert(t('common.error', 'Error'), t('checkout.addressRequired', 'Please enter a delivery address'))
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
        delivery_longitude: 35.5018, // default Beirut lon
        delivery_latitude: 33.8938,  // default Beirut lat
        scheduled_for: isScheduled && selectedSlot ? selectedSlot : undefined,
        currency_code: selectedCurrency,
        coupon_code: couponCode.trim() ? couponCode.trim() : undefined,
      })

      // Success
      clearCart()
      Alert.alert(
        t('checkout.successTitle', 'Order Placed!'),
        t('checkout.successMessage', 'Your order was successfully placed.'),
        [
          {
            text: t('common.ok', 'OK'),
            onPress: () => {
              if (result.data?.id) {
                router.replace({ pathname: '/order/[id]', params: { id: result.data.id } })
              } else {
                router.replace('/orders')
              }
            },
          },
        ]
      )
    } catch (err: any) {
      Alert.alert(t('common.error', 'Error'), err?.user_message || t('checkout.failed', 'Failed to place order'))
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
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" className="dark:text-gray-200" />
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
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <Feather name="clock" size={16} color={!isScheduled ? '#10b981' : '#6b7280'} />
                <Text className={`font-semibold text-sm ${!isScheduled ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {t('checkout.asap', 'As soon as possible')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setIsScheduled(true)}
                className={`flex-1 flex-row items-center justify-center gap-2 border rounded-2xl py-4 active:bg-gray-50 ${
                  isScheduled
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <Feather name="calendar" size={16} color={isScheduled ? '#10b981' : '#6b7280'} />
                <Text className={`font-semibold text-sm ${isScheduled ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>
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
                  <ActivityIndicator color="#10b981" />
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
                              ? 'border-emerald-500 bg-emerald-50/10'
                              : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                          }`}
                        >
                          <Text className={`text-xs font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {timeStr}
                          </Text>
                          {isSelected && <Feather name="check" size={16} color="#10b981" />}
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
                      ? 'border-emerald-500 bg-emerald-50/20'
                      : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                  }`}
                >
                  <Text className={`font-bold text-sm ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>
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
              <Text className="text-lg font-black text-emerald-600 dark:text-emerald-400">
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
