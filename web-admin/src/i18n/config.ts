import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'

// localStorage key persisting the user's chosen locale across sessions.
// Also read by the axios request interceptor to set Accept-Language.
export const LOCALE_STORAGE_KEY = 'meryata_locale'

const initialLocale =
  (typeof localStorage !== 'undefined' && localStorage.getItem(LOCALE_STORAGE_KEY)) || 'en'

// Backend-driven i18n (blueprint §6.1): ui_translations is the real source
// of truth, fetched via GET /api/v1/i18n/:locale and merged in at runtime
// (see useLocaleBootstrap). This static `en` bundle is only the
// zero-network fallback so the UI has *something* to render before that
// fetch resolves — it must never be treated as the canonical copy.
void i18n.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: initialLocale,
  fallbackLng: 'en',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n

// Client-side fallback set, used only before the backend locale list
// (which carries the authoritative is_rtl flag) has loaded.
export const RTL_LOCALES = new Set(['ar'])

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale)
}

// applyDirection sets <html dir/lang>. Pass isRtlOverride from the backend
// locale list when available (source of truth per blueprint §6.1); when
// omitted (pre-fetch), it falls back to the static RTL_LOCALES set.
export function applyDirection(locale: string, isRtlOverride?: boolean): void {
  const rtl = isRtlOverride ?? isRtl(locale)
  document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  document.documentElement.lang = locale
}
