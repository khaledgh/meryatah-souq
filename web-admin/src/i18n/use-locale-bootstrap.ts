import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient } from '../lib/api-client'
import { localeListSchema, translationsResponseSchema, type Locale } from '../schemas/localization'
import { applyDirection } from './config'

// useLocaleBootstrap wires the client to the backend-driven i18n contract
// (blueprint §6.1): on mount and whenever the active locale changes, it
// fetches GET /api/v1/i18n/:locale and merges those ui_translations over the
// static English fallback bundle, then applies text direction from the
// backend's is_rtl flag (GET /api/v1/locales) rather than a hardcoded list.
//
// The static `en` bundle shipped in the build stays as the zero-network
// fallback; backend values overwrite it key-by-key as they arrive, so the
// UI is never blank and always ends up showing the canonical strings.
export function useLocaleBootstrap() {
  const { i18n } = useTranslation()
  const [locales, setLocales] = useState<Locale[]>([])

  // Fetch the active locale list once — used by the language switcher and to
  // resolve is_rtl for direction from the backend (source of truth), not the
  // client-side RTL_LOCALES fallback.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await apiClient.get('/locales')
        const parsed = localeListSchema.parse(response.data).data ?? []
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `cancelled` is mutated by the cleanup fn after the await; the linter can't see that across the async boundary.
        if (!cancelled) setLocales(parsed)
      } catch {
        // Non-fatal: the switcher falls back to its static list and
        // direction falls back to RTL_LOCALES. A failed locale-list fetch
        // must not blank the app.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch + merge translations for the active locale, and apply direction.
  useEffect(() => {
    let cancelled = false
    const locale = i18n.language

    void (async () => {
      try {
        const response = await apiClient.get(`/i18n/${locale}`)
        const byNamespace = translationsResponseSchema.parse(response.data).data
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `cancelled` is mutated by the cleanup fn after the await; the linter can't see that across the async boundary.
        if (cancelled) return
        for (const [namespace, entries] of Object.entries(byNamespace)) {
          // deep + overwrite: backend values win over the static fallback,
          // but only for keys the backend actually provides; untranslated
          // keys keep their English fallback rather than disappearing.
          i18n.addResourceBundle(locale, namespace, entries, true, true)
        }
        // Force a re-render so components pick up the merged bundle.
        void i18n.changeLanguage(locale)
      } catch {
        // Non-fatal: the static fallback bundle already covers every key.
      }
    })()

    // Direction: prefer the backend is_rtl flag once locales are loaded;
    // applyDirection's own RTL_LOCALES fallback covers the pre-fetch window.
    const backendLocale = locales.find((l) => l.code === locale)
    applyDirection(locale, backendLocale?.is_rtl)

    return () => {
      cancelled = true
    }
  }, [i18n, i18n.language, locales])

  return { locales }
}
