import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

const BG = '#0f111a'
const CARD = '#1e2235'
const ACCENT = '#ffc20e'
const TEXT = '#f9fafb'
const MUTED = '#9ca3af'

/**
 * Order Placed Successfully screen — matches the mockup's
 * scooter-rider illustration on a yellow circle, "Order Successful!"
 * headline, and two action buttons.
 */
export default function OrderSuccessScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { orderId } = useLocalSearchParams<{ orderId?: string }>()

  const handleTrack = () => {
    if (orderId) {
      router.replace({ pathname: '/order/[id]', params: { id: orderId } })
    } else {
      router.replace('/orders')
    }
  }

  const handleHome = () => {
    router.replace('/home')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>

        {/* ── Scooter Illustration ── */}
        <View
          style={{
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: ACCENT,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            shadowColor: ACCENT,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.45,
            shadowRadius: 28,
            elevation: 16,
          }}
        >
          {/* Inner dark circle for contrast */}
          <View
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: 'rgba(0,0,0,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {/* Stacked icons simulating a scooter delivery scene */}
            <Feather name="package" size={40} color="#1a1a1a" />
            <Feather name="truck" size={34} color="#1a1a1a" />
          </View>
        </View>

        {/* ── Title ── */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: '900',
            color: TEXT,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {t('orderSuccess.title', 'Order Successful!')}
        </Text>

        {/* ── Subtitle ── */}
        <Text
          style={{
            fontSize: 13,
            color: MUTED,
            textAlign: 'center',
            lineHeight: 20,
            marginBottom: 40,
            maxWidth: 260,
          }}
        >
          {t(
            'orderSuccess.message',
            'Your payment was accepted. Your order is now being prepared and will be on its way soon!'
          )}
        </Text>

        {/* ── Track Order ── */}
        <Pressable
          onPress={handleTrack}
          style={{
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            paddingVertical: 18,
            marginBottom: 14,
            backgroundColor: ACCENT,
            shadowColor: ACCENT,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 14,
            elevation: 8,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#1a1a1a' }}>
            {t('orderSuccess.trackOrder', 'Track Order')}
          </Text>
        </Pressable>

        {/* ── Back to Home ── */}
        <Pressable
          onPress={handleHome}
          style={{
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            paddingVertical: 18,
            backgroundColor: CARD,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: MUTED }}>
            {t('orderSuccess.backHome', 'Back to Home')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
