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
import { AvailabilityProvider } from '../src/features/driver/availability-context'
import '../src/i18n/config'
import { useLocaleBootstrap } from '../src/i18n/use-locale-bootstrap'
// Side-effect import: registers the background location task at module load.
// The OS can relaunch this app headlessly to deliver a location fix, so the
// task must already be defined by the time that happens — it cannot be
// registered from inside a component.
import '../src/features/tracking/location-task'
import { TrackingController } from '../src/features/tracking/tracking-controller'

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
  // config plugin in app.json, so they're registered by the OS at install
  // and don't need a runtime useFonts() download. Just hide the splash once
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
            <AvailabilityProvider>
              <TrackingController />
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }} />
            </AvailabilityProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
