import '../global.css'

import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated'

import { AuthProvider } from '../src/features/auth/auth-context'
import { CartProvider } from '../src/features/cart/cart-context'
import '../src/i18n/config'
import { useLocaleBootstrap } from '../src/i18n/use-locale-bootstrap'

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
})

SplashScreen.preventAutoHideAsync()

function LocaleBootstrap() {
  useLocaleBootstrap()
  return null
}

export default function RootLayout() {
  const { setColorScheme } = useColorScheme()

  useEffect(() => {
    setColorScheme('light')
  }, [])

  // Icon fonts (Feather, Ionicons) are embedded natively via the expo-font
  // config plugin in app.json, so they're registered by the OS at install and
  // don't need a runtime useFonts() download — that download path (expo-asset)
  // was failing on device and is unnecessary here. Just hide the splash once
  // mounted; the embedded glyphs render immediately.
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleBootstrap />
          <AuthProvider>
            <CartProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }} />
            </CartProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
