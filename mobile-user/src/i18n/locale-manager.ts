import * as SecureStore from 'expo-secure-store'
import { I18nManager } from 'react-native'

import i18n, { isRtl } from './config'

const LOCALE_KEY = 'meryata_user_locale'

export async function getStoredLocale(): Promise<string | null> {
  return SecureStore.getItemAsync(LOCALE_KEY)
}

// setLocale persists the choice, switches i18next, and aligns native layout
// direction. On React Native, RTL is a native-layout concern: I18nManager
// must be told, and a *reload* is required for an LTR↔RTL flip to fully take
// effect (blueprint §10 / CLAUDE.md's I18nManager.forceRTL requirement).
// Returns true when a reload is needed so the caller can prompt for it.
export async function setLocale(locale: string): Promise<{ needsReload: boolean }> {
  await SecureStore.setItemAsync(LOCALE_KEY, locale)
  await i18n.changeLanguage(locale)

  const shouldBeRtl = isRtl(locale)
  const needsReload = I18nManager.isRTL !== shouldBeRtl
  if (needsReload) {
    I18nManager.allowRTL(shouldBeRtl)
    I18nManager.forceRTL(shouldBeRtl)
  }
  return { needsReload }
}

// applyStoredDirectionSync aligns I18nManager with the persisted locale at
// startup so the very first render is in the right direction. Call before
// the app mounts; if it reports needsReload, the app should reload once.
export function directionMatches(locale: string): boolean {
  return I18nManager.isRTL === isRtl(locale)
}
