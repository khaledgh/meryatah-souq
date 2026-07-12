import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { reloadAppAsync } from 'expo'

import { useAuth } from '../../../src/features/auth/auth-context'
import { setLocale } from '../../../src/i18n/locale-manager'

// ── Dark theme constants ───────────────────────────────────────────────────
const BG = '#0f111a'
const CARD = '#1e2235'
const ACCENT = '#ffc20e'
const TEXT = '#f9fafb'
const MUTED = '#9ca3af'

interface MenuItem {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  onPress: () => void
  right?: React.ReactNode
}

function MenuRow({ icon, label, onPress, right }: MenuItem) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: CARD,
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Icon circle */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: `${ACCENT}20`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={18} color={ACCENT} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: TEXT }}>{label}</Text>
      {right ?? <Feather name="chevron-right" size={16} color={MUTED} />}
    </Pressable>
  )
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { user, isGuest, logout } = useAuth()
  const [busy, setBusy] = useState(false)

  const handleLogout = () => {
    Alert.alert(
      t('profile.logoutTitle', 'Logout'),
      t('profile.logoutConfirm', 'Are you sure you want to log out?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('profile.logoutConfirmBtn', 'Logout'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await logout()
              router.replace('/(auth)/phone')
            })()
          },
        },
      ]
    )
  }

  const toggleLanguage = async () => {
    const nextLang = i18n.language === 'ar' ? 'en' : 'ar'
    setBusy(true)
    try {
      const { needsReload } = await setLocale(nextLang)
      if (needsReload) {
        Alert.alert(
          t('language.reloadTitle', 'Restart Required'),
          t('language.reloadMessage', 'The app must restart to apply the language change.'),
          [
            {
              text: t('language.reloadConfirm', 'Restart Now'),
              onPress: () => void reloadAppAsync(),
            },
          ]
        )
      }
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  const initials = user
    ? `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`.toUpperCase()
    : 'G'

  const menuItems: MenuItem[] = [
    {
      icon: 'user',
      label: t('profile.myProfile', 'My Profile'),
      onPress: () => {},
    },
    ...(user?.role === 'driver' ? [{
      icon: 'truck' as const,
      label: t('profile.switchToDriver', 'Switch to Driver App'),
      onPress: () => {
        Linking.openURL('meryatasouqdriver://').catch(() => {
          Alert.alert(
            t('common.error', 'Error'),
            t('profile.driverAppNotInstalled', 'Driver App is not installed.')
          )
        })
      }
    }] : []),
    {
      icon: 'shopping-bag',
      label: t('profile.myOrders', 'My Orders'),
      onPress: () => router.push('/orders'),
    },
    {
      icon: 'tag',
      label: t('profile.coupons', 'Coupons & Offers'),
      onPress: () => router.push('/coupons'),
    },
    {
      icon: 'globe',
      label: t('profile.language', 'App Language'),
      onPress: busy ? () => {} : () => { void toggleLanguage() },
      right: (
        <View
          style={{
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: `${ACCENT}22`,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT }}>
            {i18n.language === 'ar' ? 'العربية' : 'English'}
          </Text>
        </View>
      ),
    },
    {
      icon: 'bell',
      label: t('profile.notifications', 'Notify Me'),
      onPress: () =>
        Alert.alert(
          t('common.info', 'Info'),
          t('profile.notificationsUnavailable', 'Notification preferences are coming soon.')
        ),
    },
    {
      icon: 'help-circle',
      label: t('profile.supportHelp', 'Support & Help'),
      onPress: () => {},
    },
    {
      icon: 'shield',
      label: t('profile.privacy', 'Privacy Policy'),
      onPress: () => {},
    },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
        {/* ── Page title ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, marginBottom: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: TEXT }}>
            {t('profile.title', 'Profile')}
          </Text>
        </View>

        {/* ── Avatar card ── */}
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 24,
            backgroundColor: CARD,
            borderRadius: 28,
            padding: 20,
            alignItems: 'center',
            gap: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          {/* Avatar circle with yellow ring */}
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: `${ACCENT}22`,
              borderWidth: 3,
              borderColor: ACCENT,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: ACCENT,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            {isGuest ? (
              <Feather name="user" size={40} color={ACCENT} />
            ) : (
              <Text style={{ fontSize: 28, fontWeight: '800', color: ACCENT }}>{initials}</Text>
            )}
          </View>

          {/* Name + phone */}
          {isGuest ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>
                {t('profile.guest', 'Guest User')}
              </Text>
              <Pressable onPress={() => router.replace('/(auth)/phone')} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT, textDecorationLine: 'underline' }}>
                  {t('profile.signInNow', 'Sign in or create account')}
                </Text>
              </Pressable>
            </View>
          ) : user ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>
                {user.first_name} {user.last_name}
              </Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{user.phone}</Text>
            </View>
          ) : null}

          {/* Yellow Edit Profile button */}
          {!isGuest && (
            <Pressable
              style={{
                marginTop: 4,
                borderRadius: 20,
                paddingHorizontal: 20,
                paddingVertical: 8,
                backgroundColor: ACCENT,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1a1a1a' }}>
                {t('profile.editProfile', 'Edit Profile')}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Menu rows ── */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {menuItems.map((item) => (
            <MenuRow key={item.label} {...item} />
          ))}

          {/* Sign Out */}
          {!isGuest && (
            <Pressable
              onPress={handleLogout}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 18,
                paddingVertical: 16,
                backgroundColor: '#ef444420',
                borderWidth: 1.5,
                borderColor: '#ef444440',
                marginTop: 6,
              }}
            >
              <Feather name="log-out" size={18} color="#f87171" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#f87171' }}>
                {t('profile.signOut', 'Sign Out')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
