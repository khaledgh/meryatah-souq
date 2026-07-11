import { Feather } from '@expo/vector-icons'
import { View } from 'react-native'

type PinKind = 'pickup' | 'dropoff' | 'driver'

const PIN_STYLES: Record<PinKind, { background: string; icon: keyof typeof Feather.glyphMap }> = {
  pickup: { background: '#ffc20e', icon: 'shopping-bag' },
  dropoff: { background: '#ef4444', icon: 'map-pin' },
  driver: { background: '#2563eb', icon: 'truck' },
}

// MapLibre's Marker renders whatever child you give it — there is no
// `pinColor` shortcut like react-native-maps had — so this is the one place
// the three pin styles are defined, keeping them consistent across screens.
export function MapPin({ kind }: { kind: PinKind }) {
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
