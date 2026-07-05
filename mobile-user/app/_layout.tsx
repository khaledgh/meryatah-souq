import '../global.css'

import { useEffect } from 'react'
import { Feather, Ionicons } from '@expo/vector-icons'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
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
  const [fontsLoaded, fontError] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
  })

  useEffect(() => {
    setColorScheme('light')
  }, [])

  useEffect(() => {
    if (fontError) {
      console.error('[fonts] icon font load failed:', fontError)
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) {
    return null
  }

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
