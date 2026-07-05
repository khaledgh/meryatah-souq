import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card } from '../../components/ui/card'
import { Select } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import type { EarningsRow } from '../../schemas/stats'
import { useVendor } from '../auth/auth-context'
import { useEarnings } from './use-earnings'

const PERIODS = [7, 30, 90] as const

// Blueprint §11.B11: Earnings/Payouts — daily/period table (order volume,
// commission, net) in display currency. CSV export is deferred (no backend
// export endpoint); the period table + totals are computed from delivered
// orders' commission snapshots via GET /vendor/:id/earnings.
export function EarningsPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const [days, setDays] = useState<number>(30)
  const earnings = useEarnings(vendor.id, days)

  const currency = earnings.data?.display_currency ?? 'USD'
  const money = (n: number) => `${n.toFixed(2)} ${currency}`

  const columns: Column<EarningsRow>[] = [
    { key: 'day', header: t('earnings.day'), render: (r) => <span className="font-medium">{r.day}</span> },
    { key: 'orders', header: t('earnings.orders'), render: (r) => r.orders },
    { key: 'gross', header: t('earnings.gross'), render: (r) => money(r.gross_display) },
    { key: 'commission', header: t('earnings.commission'), render: (r) => <span className="text-red-600 dark:text-red-400">−{money(r.commission_display)}</span> },
    { key: 'net', header: t('earnings.net'), render: (r) => <span className="font-semibold text-green-700 dark:text-green-400">{money(r.net_display)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title={t('earnings.title')}
        description={t('earnings.description')}
        actions={
          <div className="w-40">
            <Select value={days} onChange={(e) => { setDays(Number(e.target.value)) }}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{t('earnings.lastDays', { count: p })}</option>
              ))}
            </Select>
          </div>
        }
      />

      {earnings.isLoading ? (
        <LoadingState />
      ) : earnings.isError ? (
        <ErrorState error={earnings.error} onRetry={() => void earnings.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TotalCard label={t('earnings.totalOrders')} value={(earnings.data?.total_orders ?? 0).toString()} />
            <TotalCard label={t('earnings.totalGross')} value={money(earnings.data?.total_gross ?? 0)} />
            <TotalCard label={t('earnings.totalCommission')} value={money(earnings.data?.total_commission ?? 0)} />
            <TotalCard label={t('earnings.totalNet')} value={money(earnings.data?.total_net ?? 0)} accent />
          </div>

          {earnings.data?.rows && earnings.data.rows.length > 0 ? (
            <DataTable columns={columns} rows={earnings.data.rows} rowKey={(r) => r.day} />
          ) : (
            <EmptyState message={t('earnings.empty')} />
          )}
        </>
      )}
    </div>
  )
}

function TotalCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${accent ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
    </Card>
  )
}
