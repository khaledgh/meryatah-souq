import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeVariant } from '../../components/ui/badge'
import { Checkbox, Select, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { orderStatuses, type Order, type OrderStatus } from '../../schemas/order'
import { useAdminOrders, type AdminOrderFilters } from './use-admin-orders'

const statusVariants: Record<OrderStatus, BadgeVariant> = {
  pending: 'neutral',
  accepted: 'brand',
  preparing: 'warning',
  on_the_way: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

// Blueprint §11.A13: Orders (all) — global table with filters (vendor,
// status, scheduled, date). Detail drawer (items, timeline, live map) and
// driver reassignment are deferred: no backend single-order admin detail
// or reassign-driver endpoint exists yet.
export function OrdersPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<AdminOrderFilters>({})
  const { data: orders, isLoading, isError, error, refetch } = useAdminOrders(filters)

  const columns: Column<Order>[] = [
    { key: 'placed', header: t('orders.placed'), render: (o) => new Date(o.placed_at).toLocaleString() },
    { key: 'vendor', header: t('orders.vendor'), render: (o) => <span className="font-mono text-xs">{o.vendor_id}</span> },
    { key: 'status', header: t('common.status'), render: (o) => <Badge variant={statusVariants[o.status]}>{t(`orderStatus.${o.status}`)}</Badge> },
    {
      key: 'total',
      header: t('orders.total'),
      render: (o) => `${o.subtotal_display.toFixed(2)} ${o.currency_code}`,
    },
    { key: 'driver', header: t('orders.driver'), render: (o) => (o.driver_id ? <span className="font-mono text-xs">{o.driver_id}</span> : '—') },
    {
      key: 'scheduled',
      header: t('orders.scheduled'),
      render: (o) => (o.scheduled_for ? new Date(o.scheduled_for).toLocaleString() : t('orders.asap')),
    },
  ]

  return (
    <div>
      <PageHeader title={t('nav.orders')} />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <TextInput
            label={t('orders.vendor')}
            value={filters.vendor_id ?? ''}
            onChange={(e) => {
              setFilters((f) => ({ ...f, vendor_id: e.target.value || undefined }))
            }}
          />
        </div>
        <div className="w-44">
          <Select
            label={t('common.status')}
            value={filters.status ?? ''}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value || undefined }))
            }}
          >
            <option value="">{t('orders.allStatuses')}</option>
            {orderStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`orderStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="pb-2">
          <Checkbox
            id="scheduled_only"
            label={t('orders.scheduledOnly')}
            checked={filters.scheduled_only ?? false}
            onChange={(e) => {
              setFilters((f) => ({ ...f, scheduled_only: e.target.checked }))
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DataTable columns={columns} rows={orders ?? []} rowKey={(o) => o.id} />
      )}
    </div>
  )
}
