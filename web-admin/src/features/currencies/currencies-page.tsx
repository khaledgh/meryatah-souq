import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { TextInput } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { CurrencyWithRate } from '../../schemas/currency'
import { useCreateCurrency, useCurrencies, useSetCurrencyActive, useSetExchangeRate } from './use-currencies'

// Blueprint §11.A11: Currencies & Rates — currencies table, exchange_rates
// editor, add currency (modal), activate/deactivate, update rate. Base
// currency's rate is fixed at 1 and it cannot be deactivated (both enforced
// server-side).
export function CurrenciesPage() {
  const { t } = useTranslation()
  const { data: currencies, isLoading, isError, error, refetch } = useCurrencies()
  const setRate = useSetExchangeRate()
  const setActive = useSetCurrencyActive()
  const createCurrency = useCreateCurrency()

  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCurrency, setNewCurrency] = useState({ code: '', symbol: '', name: '', decimals: '2' })

  const columns: Column<CurrencyWithRate>[] = [
    { key: 'code', header: t('common.code'), render: (c) => <span className="font-mono text-xs font-semibold">{c.code}</span> },
    { key: 'symbol', header: t('currencies.symbol'), render: (c) => c.symbol },
    { key: 'name', header: t('common.name'), render: (c) => c.name },
    {
      key: 'status',
      header: t('common.active'),
      render: (c) => (
        <button
          type="button"
          onClick={() => {
            setActive.mutate({ code: c.code, active: !c.is_active })
          }}
          title={c.is_active ? t('common.suspend') : t('common.activate')}
        >
          <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'rate',
      header: t('currencies.rate'),
      render: (c) => (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            value={rateDrafts[c.code] ?? c.rate.toString()}
            onChange={(e) => {
              setRateDrafts((d) => ({ ...d, [c.code]: e.target.value }))
            }}
            className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={() => {
              const value = Number(rateDrafts[c.code] ?? c.rate)
              if (!Number.isNaN(value) && value > 0) {
                setRate.mutate({ code: c.code, rate: value })
              }
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
      <PageHeader
        title={t('nav.currencies')}
        actions={
          <Button onClick={() => { setIsModalOpen(true) }}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t('currencies.create')}
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={currencies ?? []} rowKey={(c) => c.code} />
      )}

      {setActive.isError ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{toApiError(setActive.error).user_message}</p>
      ) : null}

      <Modal
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false) }}
        title={t('currencies.createTitle')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createCurrency.mutate(
              {
                code: newCurrency.code,
                symbol: newCurrency.symbol,
                name: newCurrency.name,
                decimals: Number(newCurrency.decimals) || 0,
              },
              {
                onSuccess: () => {
                  setNewCurrency({ code: '', symbol: '', name: '', decimals: '2' })
                  setIsModalOpen(false)
                },
              },
            )
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex gap-4">
            <div className="w-28">
              <TextInput
                label={t('common.code')}
                required
                value={newCurrency.code}
                onChange={(e) => { setNewCurrency((c) => ({ ...c, code: e.target.value.toUpperCase() })) }}
              />
            </div>
            <div className="w-24">
              <TextInput
                label={t('currencies.symbol')}
                required
                value={newCurrency.symbol}
                onChange={(e) => { setNewCurrency((c) => ({ ...c, symbol: e.target.value })) }}
              />
            </div>
            <div className="w-24">
              <TextInput
                type="number"
                min={0}
                max={6}
                label={t('currencies.decimals')}
                required
                value={newCurrency.decimals}
                onChange={(e) => { setNewCurrency((c) => ({ ...c, decimals: e.target.value })) }}
              />
            </div>
          </div>
          <TextInput
            label={t('common.name')}
            required
            value={newCurrency.name}
            onChange={(e) => { setNewCurrency((c) => ({ ...c, name: e.target.value })) }}
          />

          {createCurrency.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(createCurrency.error).user_message}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setIsModalOpen(false) }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={createCurrency.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
