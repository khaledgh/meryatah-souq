import type { ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Standard screen frame: safe-area aware, brand background. Pass `scroll`
// content separately when a screen needs it.
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <View className={`flex-1 px-5 ${className}`}>{children}</View>
    </SafeAreaView>
  )
}
