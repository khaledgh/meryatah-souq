import '../global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider } from '../src/features/auth/auth-context'
import '../src/i18n/config'
import { useLocaleBootstrap } from '../src/i18n/use-locale-bootstrap'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
})

function LocaleBootstrap() {
  useLocaleBootstrap()
  return null
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleBootstrap />
          <AuthProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
