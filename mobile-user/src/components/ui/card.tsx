import { Pressable, View, type PressableProps } from 'react-native'

interface CardProps extends PressableProps {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}

export function Card({ children, className = '', noPadding = false, onPress, ...props }: CardProps) {
  const Component = onPress ? Pressable : View

  return (
    // @ts-ignore
    <Component
      onPress={onPress}
      className={`rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
        !noPadding ? 'p-4' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}
