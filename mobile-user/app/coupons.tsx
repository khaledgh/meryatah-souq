import { useRouter } from 'expo-router'
import { Clipboard, FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

export default function CouponsScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  const MOCK_COUPONS = [
    { code: 'MERYATA10', desc: 'Get 10% off on your entire order', type: 'percentage', value: '10%' },
    { code: 'FREE5', desc: 'Get $5.00 off on order above $30.00', type: 'fixed', value: '$5.00' },
    { code: 'WELCOME5', desc: 'New user discount! Save $5.00 on first delivery', type: 'fixed', value: '$5.00' },
  ]

  const copyToClipboard = (code: string) => {
    Clipboard.setString(code)
    alert(t('coupons.copied', `Promo code "${code}" copied to clipboard!`))
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color="#374151" className="dark:text-gray-200" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
          {t('coupons.title', 'Available Coupons')}
        </Text>
        <View className="w-8" />
      </View>

      <FlatList
        data={MOCK_COUPONS}
        keyExtractor={(item) => item.code}
        contentContainerClassName="p-5 gap-4"
        renderItem={({ item }) => (
          <View className="border border-emerald-100 rounded-3xl bg-emerald-50/10 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/10 gap-3">
            <View className="flex-row justify-between items-center">
              <View className="bg-emerald-100 dark:bg-emerald-950 px-3 py-1 rounded-xl">
                <Text className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                  {item.code}
                </Text>
              </View>
              <Text className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {item.value} OFF
              </Text>
            </View>

            <Text className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              {item.desc}
            </Text>

            <Pressable
              onPress={() => copyToClipboard(item.code)}
              className="flex-row items-center justify-center gap-2 bg-emerald-500 rounded-2xl py-3 mt-1 active:bg-emerald-600"
            >
              <Feather name="copy" size={14} color="#fff" />
              <Text className="text-xs font-bold text-white uppercase">
                {t('coupons.copyBtn', 'Copy Code')}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  )
}
