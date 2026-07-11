import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { apiClient } from '../lib/api-client'

// GET /api/v1/i18n/:locale → { data: { <namespace>: { <key>: <value> } } }
const translationsResponseSchema = z.object({
  data: z.record(z.string(), z.record(z.string(), z.string())),
})

// Fetches backend ui_translations for the active locale and merges them over
// the static English fallback (blueprint §6.1 backend-driven i18n). Non-fatal
// on failure — the bundled fallback covers every key.
export function useLocaleBootstrap() {
  const { i18n } = useTranslation()

  useEffect(() => {
    let cancelled = false
    const locale = i18n.language

    void (async () => {
      try {
        const response = await apiClient.get(`/i18n/${locale}`)
        const byNamespace = translationsResponseSchema.parse(response.data).data
        if (cancelled) return
        for (const [namespace, entries] of Object.entries(byNamespace)) {
          i18n.addResourceBundle(locale, namespace, entries, true, true)
        }
        await i18n.changeLanguage(locale)
      } catch {
        // Fallback bundle already covers every key.
      }
    })()

    return () => { cancelled = true }
  }, [i18n, i18n.language])
}
