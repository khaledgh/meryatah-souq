import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { useAuth } from '../src/features/auth/auth-context'
import { getStoredLocale } from '../src/i18n/locale-manager'

// Entry redirector: first run (no locale chosen) → language select; then,
// if not signed in → phone entry; otherwise → the driver dashboard. There
// is no guest/skip mode in this app (blueprint §11.D: drivers must be
// authenticated).
export default function Index() {
  const { isAuthenticated, isInitializing } = useAuth()
  const [localeChosen, setLocaleChosen] = useState<boolean | null>(null)

  useEffect(() => {
    void getStoredLocale().then((locale) => { setLocaleChosen(locale !== null) })
  }, [])

  if (localeChosen === null || isInitializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-gray-950">
        <ActivityIndicator color="#ffc20e" />
      </View>
    )
  }

  if (!localeChosen) return <Redirect href="/language" />
  if (!isAuthenticated) return <Redirect href="/(auth)/phone" />
  return <Redirect href="/(app)/home" />
}
