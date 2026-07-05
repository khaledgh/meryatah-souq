import { ClipboardList, DollarSign, Package, Percent, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge, type BadgeVariant } from '../../components/ui/badge'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import type { OrderStatus } from '../../schemas/order'
import { useVendor } from '../auth/auth-context'
import { useDashboard } from './use-dashboard'

const statusVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  accepted: 'brand',
  preparing: 'warning',
  on_the_way: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`
}

// Blueprint §11.B2: Dashboard — today's orders, revenue (display currency),
// commission, open-orders, status breakdown. The live incoming-orders panel
// (WS) and low-stock alerts are deferred; this covers the KPI + breakdown
// against the new GET /vendor/:id/dashboard aggregates endpoint.
export function DashboardPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const dashboard = useDashboard(vendor.id)

  if (dashboard.isLoading) return <LoadingState />
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />

  const d = dashboard.data
  if (!d) return null

  return (
    <div>
      <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={ClipboardList} label={t('dashboard.todayOrders')} value={d.today_orders.toString()} accent="brand" />
        <KpiCard icon={DollarSign} label={t('dashboard.todayRevenue')} value={money(d.today_revenue, d.display_currency)} />
        <KpiCard icon={Percent} label={t('dashboard.todayCommission')} value={money(d.today_commission, d.display_currency)} />
        <KpiCard icon={Package} label={t('dashboard.openOrders')} value={d.open_orders.toString()} accent="brand" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t('dashboard.statusBreakdown')}
          actions={
            <Link to="/orders" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
              {t('dashboard.viewOrders')}
            </Link>
          }
        />
        <CardBody>
          {d.status_breakdown && d.status_breakdown.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {d.status_breakdown.map((sc) => (
                <div
                  key={sc.status}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                >
                  <Badge variant={statusVariant[sc.status] ?? 'neutral'}>
                    {t(`orderStatus.${sc.status as OrderStatus}`)}
                  </Badge>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sc.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.noOrders')}</p>
          )}
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            {t('dashboard.lifetimeDelivered', { count: d.lifetime_delivered })}
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
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
    </Card>
  )
}
