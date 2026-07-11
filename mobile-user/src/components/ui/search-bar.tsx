import { Feather } from '@expo/vector-icons'
import { Pressable, TextInput, View } from 'react-native'

const ACCENT = '#ffc20e'

interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  onClear?: () => void
  onSubmitEditing?: () => void
  showFilter?: boolean
  onFilter?: () => void
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onClear,
  onSubmitEditing,
  showFilter = false,
  onFilter,
}: SearchBarProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {/* White search input */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#ffffff',
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 11,
          gap: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Feather name="search" size={18} color="#9ca3af" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          style={{ flex: 1, fontSize: 14, color: '#111827', padding: 0 }}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <Pressable onPress={onClear ?? (() => onChangeText(''))} hitSlop={8}>
            <Feather name="x" size={16} color="#9ca3af" />
          </Pressable>
        )}
      </View>

      {/* Yellow filter button */}
      {showFilter && (
        <Pressable
          accessibilityRole="button"
          onPress={onFilter}
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: ACCENT,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: ACCENT,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
            elevation: 5,
          }}
        >
          <Feather name="sliders" size={18} color="#1a1a1a" />
        </Pressable>
      )}
    </View>
  )
}
