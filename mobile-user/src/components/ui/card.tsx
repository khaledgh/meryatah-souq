import type { ReactNode } from 'react'
import { Pressable, View, type PressableProps } from 'react-native'

interface CardProps extends PressableProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

// Renders as a Pressable only when an onPress is supplied, otherwise a plain
// View — branched explicitly rather than via a `Component` union, whose props
// don't typecheck against either member without suppressing the error.
export function Card({ children, className = '', noPadding = false, onPress, ...props }: CardProps) {
  const classes = `rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
    !noPadding ? 'p-4' : ''
  } ${className}`

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={classes} {...props}>
        {children}
      </Pressable>
    )
  }

  return <View className={classes}>{children}</View>
}
