import { Feather } from '@expo/vector-icons'
import { Text, View } from 'react-native'

import { Button } from './button'

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center p-8 mt-10">
      <View className="size-16 rounded-full bg-brand-50 items-center justify-center mb-4 dark:bg-brand-950/30">
        <Feather name={icon} size={28} color="#d97706" />
      </View>

      <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
        {title}
      </Text>
      
      <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-[240px]">
        {description}
      </Text>

      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} />
      )}
    </View>
  )
}
