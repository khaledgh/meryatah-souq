import { AlertCircle, CheckCircle2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { Locale, UITranslation } from '../../schemas/localization'
import {
  useCreateLocale,
  useLocales,
  useMissingKeyReport,
  useSetDefaultLocale,
  useSetLocaleActive,
  useSetLocaleRTL,
  useTranslations,
  useUpsertTranslation,
} from './use-localization'

// Blueprint §11.A12: Localization — locales table, ui_translations editor,
// missing-key report. Adding a locale with is_rtl flips client direction
// once active; enforced client-side by the consuming apps, not here.
export function LocalizationPage() {
  const { t } = useTranslation()
  const { data: locales, isLoading, isError, error, refetch } = useLocales()
  const setActive = useSetLocaleActive()
  const setDefault = useSetDefaultLocale()
  const setRtl = useSetLocaleRTL()
  const createLocale = useCreateLocale()
  const { data: missing } = useMissingKeyReport()

  const [newLocale, setNewLocale] = useState({ code: '', name: '', is_rtl: false, sort_order: 0 })
  const [selectedLocale, setSelectedLocale] = useState<string | undefined>(undefined)
  const { data: translations } = useTranslations(selectedLocale)
  const upsertTranslation = useUpsertTranslation()
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState({ namespace: '', key: '', value: '' })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const localeColumns: Column<Locale>[] = [
    { key: 'code', header: t('common.code'), render: (l) => <span className="font-mono text-xs font-semibold">{l.code}</span> },
    { key: 'name', header: t('common.name'), render: (l) => l.name },
    {
      key: 'rtl',
      header: t('localization.rtl'),
      render: (l) => (
        <input
          type="checkbox"
          checked={l.is_rtl}
          onChange={(e) => {
            setRtl.mutate({ code: l.code, isRtl: e.target.checked })
          }}
          className="size-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800"
        />
      ),
    },
    {
      key: 'default',
      header: t('localization.default'),
      render: (l) =>
        l.is_default ? (
          <Badge variant="brand">{t('localization.default')}</Badge>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDefault.mutate(l.code)
            }}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            {t('localization.setDefault')}
          </button>
        ),
    },
    {
      key: 'active',
      header: t('common.active'),
      render: (l) => (
        <button
          type="button"
          onClick={() => {
            setActive.mutate({ code: l.code, active: !l.is_active })
          }}
        >
          <Badge variant={l.is_active ? 'success' : 'neutral'}>{l.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'edit',
      header: t('localization.strings'),
      render: (l) => (
        <button
          type="button"
          onClick={() => {
            setSelectedLocale(l.code)
          }}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
        >
          <Pencil className="size-3.5" aria-hidden="true" /> {t('common.edit')}
        </button>
      ),
    },
  ]

  const translationColumns: Column<UITranslation>[] = [
    { key: 'namespace', header: t('localization.namespace'), render: (r) => r.namespace },
    { key: 'key', header: t('localization.key'), render: (r) => <span className="font-mono text-xs">{r.key}</span> },
    {
      key: 'value',
      header: t('localization.value'),
      render: (r) => (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editDrafts[r.id] ?? r.value}
            onChange={(e) => {
              setEditDrafts((d) => ({ ...d, [r.id]: e.target.value }))
            }}
            className="w-64 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={() => {
              if (!selectedLocale) return
              upsertTranslation.mutate({
                locale: selectedLocale,
                namespace: r.namespace,
                key: r.key,
                value: editDrafts[r.id] ?? r.value,
              })
            }}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {t('common.save')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title={t('nav.localization')} />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('localization.locales')} />
          <CardBody className="p-0">
            <div className="p-5">
              <DataTable columns={localeColumns} rows={locales ?? []} rowKey={(l) => l.code} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('localization.addLocale')} />
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createLocale.mutate(newLocale, {
                  onSuccess: () => {
                    setNewLocale({ code: '', name: '', is_rtl: false, sort_order: 0 })
                  },
                })
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <div className="w-28">
                <TextInput
                  label={t('common.code')}
                  required
                  value={newLocale.code}
                  onChange={(e) => {
                    setNewLocale((l) => ({ ...l, code: e.target.value }))
                  }}
                />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <TextInput
                  label={t('common.name')}
                  required
                  value={newLocale.name}
                  onChange={(e) => {
                    setNewLocale((l) => ({ ...l, name: e.target.value }))
                  }}
                />
              </div>
              <Checkbox
                id="new_locale_rtl"
                label={t('localization.rtl')}
                checked={newLocale.is_rtl}
                onChange={(e) => {
                  setNewLocale((l) => ({ ...l, is_rtl: e.target.checked }))
                }}
              />
              <Button type="submit" isLoading={createLocale.isPending}>
                {t('common.create')}
              </Button>
            </form>
            {createLocale.isError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createLocale.error).user_message}</p>
            ) : null}
          </CardBody>
        </Card>

        {selectedLocale ? (
          <Card>
            <CardHeader title={t('localization.stringsFor', { locale: selectedLocale })} />
            <CardBody className="flex flex-col gap-4">
              <DataTable columns={translationColumns} rows={translations ?? []} rowKey={(r) => r.id} />

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  upsertTranslation.mutate(
                    { locale: selectedLocale, namespace: newKey.namespace, key: newKey.key, value: newKey.value },
                    { onSuccess: () => { setNewKey({ namespace: '', key: '', value: '' }) } },
                  )
                }}
                className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800"
              >
                <div className="w-32">
                  <TextInput
                    label={t('localization.namespace')}
                    required
                    value={newKey.namespace}
                    onChange={(e) => { setNewKey((k) => ({ ...k, namespace: e.target.value })) }}
                  />
                </div>
                <div className="w-32">
                  <TextInput
                    label={t('localization.key')}
                    required
                    value={newKey.key}
                    onChange={(e) => { setNewKey((k) => ({ ...k, key: e.target.value })) }}
                  />
                </div>
                <div className="w-64">
                  <TextInput
                    label={t('localization.value')}
                    required
                    value={newKey.value}
                    onChange={(e) => { setNewKey((k) => ({ ...k, value: e.target.value })) }}
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  {t('common.create')}
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t('localization.missingKeyReport')} description={t('localization.missingKeyReportHint')} />
          <CardBody>
            {missing && missing.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {missing.map((m) => (
                  <li
                    key={`${m.locale}-${m.namespace}-${m.key}`}
                    className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-mono font-semibold">{m.locale}</span>: {m.namespace}.{m.key}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4" aria-hidden="true" /> {t('localization.noMissingKeys')}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
