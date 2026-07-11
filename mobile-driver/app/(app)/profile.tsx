import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { reloadAppAsync } from 'expo'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '../../src/features/auth/auth-context'
import { setLocale } from '../../src/i18n/locale-manager'

// D6 Profile/Language (blueprint §11.D6): profile summary, language
// switcher (writes preferred_locale via the locale-manager, same as
// mobile-user), logout.
export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [busy, setBusy] = useState(false)

  const handleLogout = () => {
    Alert.alert(t('profile.logoutTitle'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logoutConfirmBtn'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await logout()
            router.replace('/(auth)/phone')
          })()
        },
      },
    ])
  }

  const toggleLanguage = async () => {
    const nextLang = i18n.language === 'ar' ? 'en' : 'ar'
    setBusy(true)
    try {
      const { needsReload } = await setLocale(nextLang)
      if (needsReload) {
        Alert.alert(t('language.reloadTitle'), t('language.reloadMessage'), [
          { text: t('language.reloadConfirm'), onPress: () => void reloadAppAsync() },
        ])
      }
    } finally {
      setBusy(false)
    }
  }

  const initials = user
    ? `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`.toUpperCase()
    : ''

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
        <View className="px-5 pt-4 mb-5">
          <Text className="text-xl font-extrabold text-gray-900 dark:text-gray-100">{t('profile.title')}</Text>
        </View>

        <View className="mx-5 mb-6 bg-white dark:bg-gray-900 rounded-3xl p-5 items-center gap-2" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }}>
          <View
            className="size-20 rounded-full items-center justify-center"
            style={{ backgroundColor: '#ffc20e22', borderWidth: 3, borderColor: '#ffc20e' }}
          >
            <Text className="text-2xl font-black" style={{ color: '#ffc20e' }}>{initials}</Text>
          </View>
          {user ? (
            <View className="items-center">
              <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                {user.first_name} {user.last_name}
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{user.phone}</Text>
            </View>
          ) : null}
        </View>

        <View className="px-5 gap-3">
          <Pressable
            onPress={busy ? undefined : () => void toggleLanguage()}
            className="flex-row items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 px-4 py-4"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}
          >
            <View className="size-10 rounded-full items-center justify-center" style={{ backgroundColor: '#ffc20e22' }}>
              <Feather name="globe" size={18} color="#ffc20e" />
            </View>
            <Text className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('profile.language')}
            </Text>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: '#ffc20e22' }}>
              <Text className="text-xs font-bold" style={{ color: '#e0a800' }}>
                {i18n.language === 'ar' ? 'العربية' : 'English'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={handleLogout}
            className="flex-row items-center justify-center gap-2 rounded-2xl py-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          >
            <Feather name="log-out" size={18} color="#ef4444" />
            <Text className="text-sm font-bold text-red-600 dark:text-red-400">{t('profile.logoutBtn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
