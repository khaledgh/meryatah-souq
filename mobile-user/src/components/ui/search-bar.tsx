import { Feather } from '@expo/vector-icons'
import { Pressable, TextInput, View } from 'react-native'

interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  onClear?: () => void
  onSubmitEditing?: () => void
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onClear,
  onSubmitEditing,
}: SearchBarProps) {
  return (
    <View className="flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
      <Feather name="search" size={20} color="#9ca3af" className="mr-2" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        className="flex-1 text-base text-gray-900 dark:text-gray-100 p-0 leading-tight"
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={onClear || (() => onChangeText(''))} className="p-1">
          <Feather name="x" size={16} color="#9ca3af" />
        </Pressable>
      )}
    </View>
  )
}
