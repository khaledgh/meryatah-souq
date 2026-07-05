import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { useSetAppConfig, useSetFeatureFlag, useSettings } from './use-settings'

// Blueprint §11.A10: System Settings — OTP provider switch, commission
// default, storage driver, base currency, default locale, OTP TTL/length,
// feature_flags grid, saved live (no restart). app_configs values are
// stored as raw JSON, so free-form values are edited as JSON text; simple
// string values (e.g. "sms") are edited as plain text and re-quoted on
// save.
export function SettingsPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, refetch } = useSettings()
  const setAppConfig = useSetAppConfig()
  const setFeatureFlag = useSetFeatureFlag()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  function displayValue(key: string, value: unknown): string {
    if (drafts[key] !== undefined) return drafts[key]
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  function saveConfig(key: string, original: unknown) {
    const raw = drafts[key] ?? (typeof original === 'string' ? original : JSON.stringify(original))
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      value = raw
    }
    setAppConfig.mutate({ key, value })
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('nav.settings')} description={t('settings.description')} />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('settings.appConfig')} />
          <CardBody className="flex flex-col divide-y divide-gray-100 p-0 dark:divide-gray-800">
            {data?.app_configs.map((cfg) => (
              <div key={cfg.key} className="flex items-center gap-3 px-5 py-3">
                <div className="w-48 shrink-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.key}</p>
                  {cfg.description ? <p className="text-xs text-gray-400 dark:text-gray-600">{cfg.description}</p> : null}
                </div>
                <input
                  type="text"
                  value={displayValue(cfg.key, cfg.value)}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [cfg.key]: e.target.value }))
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    saveConfig(cfg.key, cfg.value)
                  }}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t('common.save')}
                </button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.featureFlags')} />
          <CardBody>
            {data?.feature_flags.length ? (
              <div className="flex flex-col gap-3">
                {data.feature_flags.map((flag) => (
                  <label
                    key={flag.key}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-800"
                  >
                    <span className="text-gray-700 dark:text-gray-300">{flag.key}</span>
                    <input
                      type="checkbox"
                      checked={flag.enabled}
                      onChange={(e) => {
                        setFeatureFlag.mutate({ key: flag.key, enabled: e.target.checked, config: flag.config })
                      }}
                      className="size-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.empty')}</p>
            )}
          </CardBody>
        </Card>
      </div>

      {setAppConfig.isError ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{toApiError(setAppConfig.error).user_message}</p>
      ) : null}
    </div>
  )
}
