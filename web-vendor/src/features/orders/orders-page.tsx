import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeVariant } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { VALID_TRANSITIONS, type Order, type OrderStatus } from '../../schemas/order'
import { useVendor } from '../auth/auth-context'
import { useUpdateOrderStatus, useVendorOrders } from './use-orders'

const statusVariant: Record<OrderStatus, BadgeVariant> = {
  pending: 'warning',
  accepted: 'brand',
  preparing: 'warning',
  on_the_way: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

// Tab filters: an "all" pseudo-tab plus the workflow statuses a vendor acts
// on most. delivered/cancelled are reachable via "all".
const TABS: (OrderStatus | 'all')[] = ['all', 'pending', 'accepted', 'preparing', 'on_the_way', 'delivered']

// The action button styling per target status — cancel is destructive,
// forward transitions are primary/secondary.
function transitionVariant(target: OrderStatus): 'primary' | 'destructive' {
  return target === 'cancelled' ? 'destructive' : 'primary'
}

// Blueprint §11.B9: Orders — tabs, per-order status transitions (accept,
// preparing, on_the_way, delivered, cancel). Realtime incoming (WS) and the
// full detail drawer (items, delivery map) are deferred: this covers the
// status workflow against the existing list + transition endpoints. The
// on_the_way transition is gated server-side on a driver being assigned;
// we surface that as an error if attempted early.
export function OrdersPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const [tab, setTab] = useState<OrderStatus | 'all'>('all')
  const orders = useVendorOrders(vendor.id, tab === 'all' ? undefined : tab)
  const updateStatus = useUpdateOrderStatus(vendor.id)

  const columns: Column<Order>[] = [
    { key: 'id', header: t('orders.order'), render: (o) => <span className="font-mono text-xs">{o.id.slice(0, 8)}</span> },
    { key: 'placed', header: t('orders.placed'), render: (o) => <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(o.placed_at).toLocaleString()}</span> },
    {
      key: 'total',
      header: t('orders.total'),
      render: (o) => <span className="font-medium">{o.subtotal_display.toFixed(2)} {o.currency_code}</span>,
    },
    {
      key: 'schedule',
      header: t('orders.fulfillment'),
      render: (o) => (o.scheduled_for ? new Date(o.scheduled_for).toLocaleString() : t('orders.asap')),
    },
    { key: 'driver', header: t('orders.driver'), render: (o) => (o.driver_id ? <span className="font-mono text-xs">{o.driver_id.slice(0, 8)}</span> : <span className="text-gray-400">—</span>) },
    {
      key: 'status',
      header: t('common.status'),
      render: (o) => <Badge variant={statusVariant[o.status]}>{t(`orderStatus.${o.status}`)}</Badge>,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (o) => {
        const targets = VALID_TRANSITIONS[o.status]
        if (targets.length === 0) return <span className="text-gray-400">—</span>
        return (
          <div className="flex flex-wrap items-center gap-2">
            {targets.map((target) => (
              <Button
                key={target}
                size="sm"
                variant={transitionVariant(target)}
                isLoading={updateStatus.isPending && updateStatus.variables?.orderId === o.id && updateStatus.variables.status === target}
                onClick={() => { updateStatus.mutate({ orderId: o.id, status: target }) }}
              >
                {t(`orders.transitions.${target}`)}
              </Button>
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader title={t('orders.title')} description={t('orders.description')} />

      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((tabKey) => {
          const isActive = tab === tabKey
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => { setTab(tabKey) }}
              className={`relative px-3 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-700 dark:text-brand-300'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tabKey === 'all' ? t('orders.tabs.all') : t(`orderStatus.${tabKey}`)}
              {isActive ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>

      {updateStatus.isError ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{toApiError(updateStatus.error).user_message}</p>
      ) : null}

      {orders.isLoading ? (
        <LoadingState />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data && orders.data.length === 0 ? (
        <EmptyState message={t('orders.empty')} />
      ) : (
        <DataTable columns={columns} rows={orders.data ?? []} rowKey={(o) => o.id} />
      )}
    </div>
  )
}
