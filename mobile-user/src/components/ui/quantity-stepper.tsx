import { Feather } from '@expo/vector-icons'
import { Text, Pressable, View } from 'react-native'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: 'sm' | 'md'
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 'md',
}: QuantityStepperProps) {
  const isSm = size === 'sm'

  const decrement = () => {
    if (value > min) onChange(value - 1)
  }

  const increment = () => {
    if (value < max) onChange(value + 1)
  }

  return (
    <View className="flex-row items-center bg-gray-100 rounded-xl px-1.5 py-1 dark:bg-gray-800">
      <Pressable
        onPress={decrement}
        disabled={value <= min}
        className={`items-center justify-center rounded-lg bg-white active:bg-gray-50 dark:bg-gray-700 dark:active:bg-gray-600 ${
          isSm ? 'size-6' : 'size-8'
        } ${value <= min ? 'opacity-40' : ''}`}
      >
        <Feather name="minus" size={isSm ? 14 : 18} color="#4b5563" className="dark:text-gray-200" />
      </Pressable>

      <Text
        className={`font-semibold text-center text-gray-800 dark:text-gray-200 ${
          isSm ? 'text-sm min-w-[20px] mx-1.5' : 'text-base min-w-[28px] mx-2'
        }`}
      >
        {value}
      </Text>

      <Pressable
        onPress={increment}
        disabled={value >= max}
        className={`items-center justify-center rounded-lg bg-white active:bg-gray-50 dark:bg-gray-700 dark:active:bg-gray-600 ${
          isSm ? 'size-6' : 'size-8'
        } ${value >= max ? 'opacity-40' : ''}`}
      >
        <Feather name="plus" size={isSm ? 14 : 18} color="#4b5563" className="dark:text-gray-200" />
      </Pressable>
    </View>
  )
}
