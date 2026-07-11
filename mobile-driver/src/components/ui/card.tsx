import { Pressable, View, type PressableProps } from 'react-native'
import type { ReactNode } from 'react'

interface CardProps extends PressableProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function Card({ children, className = '', noPadding = false, onPress, ...props }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={`rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
          !noPadding ? 'p-4' : ''
        } ${className}`}
        {...props}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View
      className={`rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
        !noPadding ? 'p-4' : ''
      } ${className}`}
    >
      {children}
    </View>
  )
}
