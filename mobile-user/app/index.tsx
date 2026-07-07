import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import * as SecureStore from 'expo-secure-store'

import { useAuth } from '../src/features/auth/auth-context'
import { getStoredLocale } from '../src/i18n/locale-manager'

// Entry redirector: first run (no locale chosen) → language select; then, if
// not onboarded → welcome swiper; then, if not signed in → phone entry; otherwise → home.
export default function Index() {
  const { isAuthenticated, isGuest, isInitializing } = useAuth()
  const [localeChosen, setLocaleChosen] = useState<boolean | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    void getStoredLocale().then((locale) => { setLocaleChosen(locale !== null) })
    void SecureStore.getItemAsync('meryata_user_onboarded').then((val) => { setOnboarded(val === 'true') })
  }, [])

  if (localeChosen === null || onboarded === null || isInitializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-gray-950">
        <ActivityIndicator color="#f59e0b" />
      </View>
    )
  }

  if (!localeChosen) return <Redirect href="/language" />
  if (!onboarded) return <Redirect href="/welcome" />
  if (!isAuthenticated && !isGuest) return <Redirect href="/(auth)/phone" />
  return <Redirect href="/home" />
}
