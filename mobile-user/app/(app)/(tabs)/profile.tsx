import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { reloadAppAsync } from 'expo'

import { Button } from '../../../src/components/ui/button'
import { useAuth } from '../../../src/features/auth/auth-context'
import { setLocale } from '../../../src/i18n/locale-manager'

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { user, isGuest, logout } = useAuth()
  const [busy, setBusy] = useState(false)

  const handleLogout = async () => {
    Alert.alert(
      t('profile.logoutTitle', 'Logout'),
      t('profile.logoutConfirm', 'Are you sure you want to log out?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('profile.logoutConfirmBtn', 'Logout'),
          style: 'destructive',
          onPress: async () => {
            await logout()
            router.replace('/(auth)/phone')
          },
        },
      ]
    )
  }

  const toggleLanguage = async () => {
    const nextLang = i18n.language === 'ar' ? 'en' : 'ar'
    setBusy(true)
    try {
      const { needsReload } = await setLocale(nextLang)
      if (needsReload) {
        Alert.alert(
          t('language.reloadTitle', 'Restart Required'),
          t('language.reloadMessage', 'The app must restart to apply the language direction changes.'),
          [
            {
              text: t('language.reloadConfirm', 'Restart Now'),
              onPress: () => void reloadAppAsync(),
            },
          ]
        )
      }
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {t('profile.title', 'My Profile')}
        </Text>
      </View>

      {/* User Information */}
      <View className="px-5 py-6 items-center border-b border-gray-50 dark:border-gray-800/50">
        <View className="size-20 rounded-full bg-brand-50 items-center justify-center mb-3 dark:bg-brand-950/30">
          <Feather name="user" size={36} color="#f59e0b" />
        </View>
        
        {isGuest ? (
          <View className="items-center">
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('profile.guest', 'Guest User')}
            </Text>
            <Pressable
              onPress={() => router.replace('/(auth)/phone')}
              className="mt-1"
            >
              <Text className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                {t('profile.signInNow', 'Sign in or create account')}
              </Text>
            </Pressable>
          </View>
        ) : user ? (
          <View className="items-center">
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {user.first_name} {user.last_name}
            </Text>
            <Text className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {user.phone}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Settings Options */}
      <View className="p-5 gap-3 flex-1">
        {/* Language Selection Row */}
        <Pressable
          onPress={toggleLanguage}
          disabled={busy}
          className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
        >
          <View className="flex-row items-center gap-3">
            <View className="size-10 rounded-xl bg-brand-50 items-center justify-center dark:bg-brand-950/30">
              <Feather name="globe" size={20} color="#f59e0b" />
            </View>
            <Text className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {t('profile.language', 'App Language')}
            </Text>
          </View>
          <Text className="text-sm font-bold text-brand-600 dark:text-brand-400">
            {i18n.language === 'ar' ? 'العربية' : 'English'}
          </Text>
        </Pressable>

        {/* Coupons & Offers */}
        <Pressable
          onPress={() => router.push('/coupons')}
          className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
        >
          <View className="flex-row items-center gap-3">
            <View className="size-10 rounded-xl bg-brand-50 items-center justify-center dark:bg-brand-950/30">
              <Feather name="tag" size={20} color="#f59e0b" />
            </View>
            <Text className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {t('profile.coupons', 'Coupons & Offers')}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color="#9ca3af" />
        </Pressable>

        {/* Saved Addresses (Placeholder) */}
        {!isGuest && (
          <Pressable
            onPress={() => Alert.alert(t('common.info', 'Information'), t('profile.addressesUnavailable', 'Saved addresses will be available in the next release.'))}
            className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-10 rounded-xl bg-brand-50 items-center justify-center dark:bg-brand-950/30">
                <Feather name="map-pin" size={20} color="#f59e0b" />
              </View>
              <Text className="text-base font-semibold text-gray-800 dark:text-gray-200">
                {t('profile.savedAddresses', 'Saved Addresses')}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color="#9ca3af" />
          </Pressable>
        )}
      </View>

      {/* Logout button */}
      {!isGuest && (
        <View className="p-5">
          <Button
            label={t('profile.logoutBtn', 'Logout')}
            variant="secondary"
            onPress={handleLogout}
          />
        </View>
      )}
    </SafeAreaView>
  )
}
