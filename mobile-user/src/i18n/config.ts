import i18n from 'i18next'
import { getLocales } from 'expo-localization'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import ar from './locales/ar.json'

// Backend-driven i18n (blueprint §6.1): ui_translations fetched via GET
// /api/v1/i18n/:locale and merged at runtime (see useLocaleBootstrap). This
// static `en` bundle is only the zero-network fallback.
export const SUPPORTED_LOCALES = ['en', 'ar'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const RTL_LOCALES = new Set<string>(['ar'])

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale)
}

// Pick the device locale if we support it, else English. The user can
// override on the C1 language-select screen.
function deviceLocale(): SupportedLocale {
  const first = getLocales()[0]?.languageCode ?? 'en'
  return (SUPPORTED_LOCALES as readonly string[]).includes(first) ? (first as SupportedLocale) : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    ar: { common: ar },
  },
  lng: deviceLocale(),
  fallbackLng: 'en',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n
