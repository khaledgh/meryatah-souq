import { Text, View } from 'react-native'

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'

interface BadgeProps {
  children: string
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400 border border-green-200/50 dark:border-green-800/30',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30',
  error: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200/50 dark:border-red-800/30',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30',
  neutral: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50',
  brand: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30',
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${variantStyles[variant]} ${className}`}>
      <Text className="text-xs font-semibold leading-tight text-current">{children}</Text>
    </View>
  )
}
