import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { applyDirection, LOCALE_STORAGE_KEY } from '../i18n/config'

// A minimal static list is used until GET /api/v1/locales is fetched (see
// useLocales); this keeps the switcher functional even before that request
// resolves, per §10's directive that every screen must have a working
// loading state rather than an empty one.
const FALLBACK_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
]

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  const handleChange = (locale: string) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    void i18n.changeLanguage(locale)
    applyDirection(locale)
  }

  return (
    <div className="relative">
      <Globe
        className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-2.5 size-4 text-gray-400"
        aria-hidden="true"
      />
      <select
        aria-label={t('languageSwitcher.label')}
        value={i18n.language}
        onChange={(e) => {
          handleChange(e.target.value)
        }}
        className="rounded-lg border border-gray-300 bg-white py-1.5 ps-8 pe-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {FALLBACK_LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.name}
          </option>
        ))}
      </select>
    </div>
  )
}
