import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { reloadAppAsync } from 'expo'

import { Screen } from '../src/components/ui/screen'
import { SUPPORTED_LOCALES } from '../src/i18n/config'
import { setLocale } from '../src/i18n/locale-manager'

// Blueprint §11.C1: Splash / Language Select — first-run picker that sets
// locale + direction. Choosing Arabic flips native layout to RTL, which
// needs an app reload to take effect (I18nManager); we prompt for it.
export default function LanguageScreen() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const choose = async (locale: string) => {
    setBusy(true)
    const { needsReload } = await setLocale(locale)
    if (needsReload) {
      Alert.alert(t('language.reloadTitle'), t('language.reloadMessage'), [
        { text: t('language.reloadConfirm'), onPress: () => void reloadAppAsync() },
      ])
      return
    }
    router.replace('/(auth)/phone')
  }

  return (
    <Screen className="justify-center">
      <Text className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('language.title')}</Text>
      <Text className="mb-8 text-base text-gray-500 dark:text-gray-400">{t('language.subtitle')}</Text>

      <View className="gap-3">
        {SUPPORTED_LOCALES.map((locale) => (
          <Pressable
            key={locale}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void choose(locale)}
            className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 active:bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
          >
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {locale === 'ar' ? t('language.arabic') : t('language.english')}
            </Text>
            <Text className="text-sm uppercase text-gray-400">{locale}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}
