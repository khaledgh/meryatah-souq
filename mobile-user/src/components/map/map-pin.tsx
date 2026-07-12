import { Feather } from '@expo/vector-icons'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { ComponentProps } from 'react'
import { View, Text } from 'react-native'

type PinKind = 'pickup' | 'dropoff' | 'driver'

const PIN_STYLES: Record<PinKind, { background: string; icon: keyof typeof Feather.glyphMap }> = {
  pickup: { background: '#ffc20e', icon: 'shopping-bag' },
  dropoff: { background: '#ef4444', icon: 'map-pin' },
  driver: { background: '#ffc20e', icon: 'truck' }, // not used directly for driver now, overridden below
}

// MapLibre's Marker renders whatever child you give it — there is no
// `pinColor` shortcut like react-native-maps had — so this is the one place
// the three pin styles are defined, keeping them consistent across screens.
export function MapPin({ kind, driverName }: { kind: PinKind; driverName?: string }) {
  if (kind === 'driver') {
    return (
      <View className="items-center justify-center">
        {driverName ? (
          <View
            className="bg-gray-900/90 px-2 py-0.5 rounded-md border border-gray-800 mb-1 shadow"
            style={{ elevation: 2 }}
          >
            <Text className="text-[10px] font-extrabold text-white text-center whitespace-nowrap">
              🏍️ {driverName}
            </Text>
          </View>
        ) : null}
        <View
          className="size-9 items-center justify-center rounded-full border-2 border-white"
          style={{
            backgroundColor: '#ffc20e',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <MaterialCommunityIcons name={"motorcycle" as ComponentProps<typeof MaterialCommunityIcons>['name']} size={18} color="#111827" />
        </View>
      </View>
    )
  }

  const { background, icon } = PIN_STYLES[kind]
  return (
    <View
      className="size-8 items-center justify-center rounded-full border-2 border-white"
      style={{
        backgroundColor: background,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
      }}
    >
      <Feather name={icon} size={15} color="#ffffff" />
    </View>
  )
}
