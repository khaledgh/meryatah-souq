import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ACTIVE = '#ffc20e'
const INACTIVE = '#9ca3af'

// The bar's content height, above whatever the system reserves below it.
const TAB_BAR_CONTENT_HEIGHT = 60

// Tab layout for the authenticated driver shell. D2 (Availability) and D3
// (Incoming Requests) live together on the "home" tab since availability
// directly gates what the requests list shows (blueprint §11.D2/D3 are
// tightly coupled: going online is what makes requests appear at all).
export default function AppLayout() {
  const { t } = useTranslation()

  // Expo SDK 54 forces edge-to-edge on Android: the app draws UNDERNEATH the
  // system navigation bar. The previous hardcoded `height: 64` /
  // `paddingBottom: 10` therefore put the bottom of the tab bar behind the
  // nav bar — icons and labels were clipped and partly untappable. The real
  // inset is ~48dp for 3-button navigation and ~24dp for gestures, so it has
  // to be measured, not guessed.
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          paddingHorizontal: 4,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f1f1',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: t('nav.active'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('nav.history'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
