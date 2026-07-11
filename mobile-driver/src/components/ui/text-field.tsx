import { Text, TextInput, View, type TextInputProps } from 'react-native'

interface TextFieldProps extends TextInputProps {
  label: string
  error?: string
}

export function TextField({ label, error, ...props }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</Text>
      <TextInput
        placeholderTextColor="#9ca3af"
        className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        {...props}
      />
      {error ? <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text> : null}
    </View>
  )
}
