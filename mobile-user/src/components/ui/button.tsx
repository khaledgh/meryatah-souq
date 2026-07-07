import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native'

type Variant = 'primary' | 'secondary'

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string
  variant?: Variant
  isLoading?: boolean
}

const base = 'flex-row items-center justify-center rounded-xl px-5 py-3.5'
const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'border border-gray-300 bg-white active:bg-gray-50 dark:border-gray-700 dark:bg-gray-900',
}
const labelClasses: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-gray-800 dark:text-gray-100',
}

export function Button({ label, variant = 'primary', isLoading = false, disabled, ...props }: ButtonProps) {
  const isDisabled = disabled ?? isLoading
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={`${base} ${variantClasses[variant]} ${isDisabled ? 'opacity-50' : ''}`}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#d97706'} />
      ) : (
        <Text className={`text-base font-semibold ${labelClasses[variant]}`}>{label}</Text>
      )}
    </Pressable>
  )
}
