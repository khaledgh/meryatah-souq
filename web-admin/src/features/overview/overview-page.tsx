import { useQuery } from '@tanstack/react-query'
import { CircleDollarSign, Percent, ShoppingBag, Store, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card } from '../../components/ui/card'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { apiClient } from '../../lib/api-client'
import { vendorListSchema } from '../../schemas/vendor'

// Blueprint §11.A2: Overview / KPIs. Cards (today orders, GMV, commission
// earned, active vendors, online drivers), recent orders table, revenue
// trend chart. The backend has no dedicated aggregates endpoint yet
// (GET /admin/orders with filters exists for the Orders page, but no
// pre-aggregated KPI summary route) — this page shows what's derivable
// today (active vendor count) and documents the rest as pending a
// dedicated backend aggregates endpoint, rather than fabricating numbers
// client-side from unpaginated data.
export function OverviewPage() {
  const { t } = useTranslation()
  const {
    data: vendors,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['overview-vendors'],
    queryFn: async () => {
      const response = await apiClient.get('/vendors/nearby', {
        params: { lon: 35.5, lat: 33.9, radius_m: 20000000, limit: 100 },
      })
      return vendorListSchema.parse(response.data).data
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const activeVendors = (vendors ?? []).filter((v) => v.is_active).length

  return (
    <div>
      <PageHeader title={t('nav.overview')} description={t('overview.description')} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard icon={Store} label={t('overview.activeVendors')} value={activeVendors.toString()} accent="brand" />
        <KpiCard icon={ShoppingBag} label={t('overview.todaysOrders')} value="—" note={t('overview.requiresAggregates')} />
        <KpiCard icon={CircleDollarSign} label={t('overview.gmv')} value="—" note={t('overview.requiresAggregates')} />
        <KpiCard icon={Percent} label={t('overview.commissionEarned')} value="—" note={t('overview.requiresAggregates')} />
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  accent = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  note?: string
  accent?: 'brand' | 'neutral'
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${
            accent === 'brand'
              ? 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300'
              : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
      {note ? <p className="mt-1 text-xs text-gray-400 dark:text-gray-600" title={note}>{note}</p> : null}
    </Card>
  )
}
