import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Eye, MapPin, User } from 'lucide-react'

import { Badge, type BadgeVariant } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { Modal } from '../../components/ui/modal'
import { toApiError, apiClient, BASE_URL } from '../../lib/api-client'
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

const TABS: (OrderStatus | 'all')[] = ['all', 'pending', 'accepted', 'preparing', 'on_the_way', 'delivered']

function transitionVariant(target: OrderStatus): 'primary' | 'destructive' {
  return target === 'cancelled' ? 'destructive' : 'primary'
}

export function OrdersPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const [tab, setTab] = useState<OrderStatus | 'all'>('all')

  // Setup TanStack Query with 5-second polling interval for real-time order dashboard
  const orders = useVendorOrders(vendor.id, tab === 'all' ? undefined : tab)
  
  // Also pass the refetchInterval to the query options.
  // Wait, useVendorOrders helper in use-orders.ts is already defined. Let's see if we can refetch manually
  // or configure it. Since react-query automatically caches, we can call refetch in an interval!
  useEffect(() => {
    const interval = setInterval(() => {
      void orders.refetch()
    }, 5000)
    return () => clearInterval(interval)
  }, [orders])

  const updateStatus = useUpdateOrderStatus(vendor.id)

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  // Live WebSocket Driver Location Tracking inside Details Modal (when status is on_the_way)
  useEffect(() => {
    if (!selectedOrder || selectedOrder.status !== 'on_the_way') {
      setDriverLocation(null)
      setWsStatus('disconnected')
      return
    }

    let socket: WebSocket | null = null
    let active = true

    const connectWS = async () => {
      setWsStatus('connecting')
      try {
        const ticketRes = await apiClient.post<{ data: { ticket: string } }>('/ws/ticket')
        const ticket = ticketRes.data.data.ticket

        if (!active) return

        const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws'
        const rawHost = BASE_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${wsProtocol}://${rawHost}/ws/orders/${selectedOrder.id}/track?ticket=${ticket}`

        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          if (active) setWsStatus('connected')
        }

        socket.onmessage = (event) => {
          if (!active) return
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'driver_location') {
              setDriverLocation({
                latitude: data.latitude,
                longitude: data.longitude,
              })
            }
          } catch {
            // ignore
          }
        }

        socket.onclose = () => {
          if (active) {
            setWsStatus('disconnected')
            setTimeout(() => {
              if (active) connectWS()
            }, 3000)
          }
        }

        socket.onerror = () => {
          if (active) setWsStatus('disconnected')
        }
      } catch {
        if (active) {
          setWsStatus('disconnected')
          setTimeout(() => {
            if (active) connectWS()
          }, 5000)
        }
      }
    }

    void connectWS()

    return () => {
      active = false
      if (socket) socket.close()
    }
  }, [selectedOrder])

  // CSV Export utility
  const handleExportCSV = () => {
    if (!orders.data || orders.data.length === 0) return

    const headers = ['Order ID', 'Placed At', 'Total Price', 'Fulfillment', 'Driver ID', 'Status']
    const rows = orders.data.map((o) => [
      o.id,
      new Date(o.placed_at).toLocaleString(),
      `${o.subtotal_display.toFixed(2)} ${o.currency_code}`,
      o.scheduled_for ? new Date(o.scheduled_for).toLocaleString() : 'ASAP',
      o.driver_id || 'Unassigned',
      o.status,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `orders_export_${vendor.id}_${tab}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

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
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedOrder(o)}
              className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400 font-semibold mr-2"
            >
              <Eye className="size-3.5" /> {t('common.view', 'Details')}
            </button>
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
      <div className="flex justify-between items-center mb-4">
        <PageHeader title={t('orders.title')} description={t('orders.description')} />
        {orders.data && orders.data.length > 0 && (
          <Button onClick={handleExportCSV} variant="secondary" className="inline-flex items-center gap-1.5">
            <Download className="size-4" /> {t('orders.exportCSV', 'Export CSV')}
          </Button>
        )}
      </div>

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

      {/* Details Modal / Drawer */}
      <Modal
        open={!!selectedOrder}
        onClose={() => { setSelectedOrder(null); setDriverLocation(null) }}
        title={`${t('orders.order', 'Order')} #${selectedOrder?.id.slice(0, 8)}`}
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Status Summary */}
            <div className="flex items-center justify-between border-b pb-4 dark:border-gray-800">
              <div>
                <p className="text-xs text-gray-400">{t('orders.placed', 'Placed At')}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {new Date(selectedOrder.placed_at).toLocaleString()}
                </p>
              </div>
              <Badge variant={statusVariant[selectedOrder.status]}>
                {t(`orderStatus.${selectedOrder.status}`)}
              </Badge>
            </div>

            {/* Customer Details */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <User className="size-4 text-emerald-500" /> {t('orders.customerDetails', 'Customer Info')}
              </h3>
              <div className="rounded-xl border p-4 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30 text-sm space-y-1">
                <p className="text-gray-600 dark:text-gray-400">
                  <strong>{t('orders.customerId', 'User ID')}:</strong> {selectedOrder.user_id}
                </p>
                {selectedOrder.delivery_latitude && selectedOrder.delivery_longitude && (
                  <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1 mt-2">
                    <MapPin className="size-3.5 text-red-500" />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.delivery_latitude},${selectedOrder.delivery_longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                    >
                      {t('orders.viewOnMap', 'Open Delivery Location in Google Maps')}
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {t('orders.items', 'Ordered Items')}
              </h3>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 border rounded-xl overflow-hidden bg-white dark:bg-gray-950">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-3 text-sm">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-200">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          {item.quantity} x ${item.unit_price_usd.toFixed(2)}
                        </p>
                      </div>
                      <p className="font-bold text-gray-900 dark:text-gray-100">
                        ${(item.unit_price_usd * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-gray-400">
                    {t('orders.noItemsDetails', 'Items list is empty or unavailable')}
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-brand-50/20 border border-brand-100/50 rounded-xl p-4 dark:bg-brand-950/10 dark:border-brand-900/30 flex justify-between items-center">
              <div>
                <p className="text-xs text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
                  {t('orders.totalPaid', 'Total Paid')}
                </p>
                <p className="text-lg font-black text-brand-800 dark:text-brand-300">
                  {selectedOrder.subtotal_display.toFixed(2)} {selectedOrder.currency_code}
                </p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{t('orders.commission', 'Commission')}: ${selectedOrder.commission_usd.toFixed(2)}</p>
              </div>
            </div>

            {/* Live Driver Tracking Map details if on_the_way */}
            {selectedOrder.status === 'on_the_way' && (
              <div className="border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 bg-emerald-50/10 dark:bg-emerald-950/10 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    {t('orders.liveDriverLocation', 'Live Driver Tracking')}
                  </h4>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded text-emerald-800 dark:text-emerald-400 font-bold uppercase">
                    {wsStatus === 'connected' ? t('orders.live', 'Live') : t('orders.connecting', 'Connecting...')}
                  </span>
                </div>
                {driverLocation ? (
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>
                      <strong>{t('orders.driverLat', 'Latitude')}:</strong> {driverLocation.latitude.toFixed(6)}
                    </p>
                    <p>
                      <strong>{t('orders.driverLon', 'Longitude')}:</strong> {driverLocation.longitude.toFixed(6)}
                    </p>
                    <p className="text-xs pt-1">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${driverLocation.latitude},${driverLocation.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                      >
                        {t('orders.viewDriverOnMap', 'Open Driver Location in Google Maps')}
                      </a>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    {t('orders.waitingForLocation', 'Waiting for driver GPS coordinates...')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
