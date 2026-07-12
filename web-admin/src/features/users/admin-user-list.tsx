import { Plus, RotateCcw, ShieldCheck, ShieldOff, Star, Store, MapPin, User } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { TextInput as Input } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { userDisplayName, type AdminUser } from '../../schemas/user'
import { useAdminUsers, useCreateDriver, useCreateUser, useResetLockout, useSetUserActive, useDriverDetail, type CreateUserInput } from './use-admin-users'

// Shared list view for A6 (Drivers) and A7 (Users) — both blueprint
// sections use the same shape (list + activate/deactivate + reset
// lockout), differing only in role filter and page title.
export function AdminUserList({ role, title }: { role: 'user' | 'driver'; title: string }) {
  const { t } = useTranslation()
  const { data: users, isLoading, isError, error, refetch } = useAdminUsers(role)
  const setActive = useSetUserActive(role)
  const resetLockout = useResetLockout(role)
  const createUser = useCreateUser()
  const createDriver = useCreateDriver()

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateUserInput>({
    defaultValues: { role: role === 'driver' ? 'driver' : 'user' },
  })

  const onSubmit = async (data: CreateUserInput) => {
    try {
      // Drivers go through the dedicated endpoint (passwordless, phone-
      // verified, active — the correct driver setup per §11.A6); everyone
      // else through the generic create-user endpoint with a chosen role.
      if (role === 'driver') {
        await createDriver.mutateAsync({
          phone: data.phone,
          first_name: data.first_name,
          last_name: data.last_name,
        })
      } else {
        await createUser.mutateAsync(data)
      }
      setIsModalOpen(false)
      reset()
    } catch {
      // API client already handles showing generic errors, or you can add local toast handling
    }
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: t('common.name'), render: userDisplayName },
    { key: 'phone', header: t('auth.phoneLabel'), render: (u) => u.phone },
    {
      key: 'status',
      header: t('common.active'),
      render: (u) => <Badge variant={u.is_active ? 'success' : 'neutral'}>{u.is_active ? t('common.active') : t('common.inactive')}</Badge>,
    },
    {
      key: 'verified',
      header: t('common.phoneVerified'),
      render: (u) => (u.phone_verified ? <Badge variant="brand">{t('common.yes')}</Badge> : <span className="text-gray-400 dark:text-gray-600">{t('common.no')}</span>),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (u) => (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setActive.mutate({ userId: u.id, active: !u.is_active })
            }}
            className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
          >
            {u.is_active ? <ShieldOff className="size-3.5" aria-hidden="true" /> : <ShieldCheck className="size-3.5" aria-hidden="true" />}
            {u.is_active ? t('common.inactive') : t('common.active')}
          </button>
          <button
            type="button"
            onClick={() => {
              resetLockout.mutate(u.id)
            }}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> {t('common.resetLockout')}
          </button>
          {role === 'driver' && (
            <button
              type="button"
              onClick={() => {
                setSelectedDriverId(u.id)
              }}
              className="text-brand-600 hover:underline dark:text-brand-400 font-semibold"
            >
              {t('drivers.checkDetails', 'Check Details')}
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          <Button onClick={() => { setIsModalOpen(true) }}>
            <Plus className="me-2 size-4" />
            {role === 'driver' ? t('drivers.create') : t('users.create')}
          </Button>
        }
      />
      <DataTable columns={columns} rows={users ?? []} rowKey={(u) => u.id} />

      <Modal
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false) }}
        title={role === 'driver' ? t('drivers.create') : t('users.create')}
      >
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <Input
            label={t('auth.firstNameLabel')}
            {...register('first_name', { required: true })}
            required
          />
          <Input
            label={t('auth.lastNameLabel')}
            {...register('last_name', { required: true })}
            required
          />
          <Input
            label={t('auth.phoneLabel')}
            type="tel"
            placeholder={t('users.phonePlaceholder')}
            {...register('phone', { required: true })}
            required
          />

          {/* Role is only selectable on the Users page; drivers always get
              role=driver via the dedicated create-driver endpoint. */}
          {role !== 'driver' ? (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('users.role')}
              </label>
              <select
                {...register('role')}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-brand-400 dark:focus:ring-brand-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
              >
                <option value="user">{t('users.roleUser')}</option>
                <option value="vendor">{t('users.roleVendor')}</option>
                <option value="driver">{t('users.roleDriver')}</option>
              </select>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setIsModalOpen(false) }}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {selectedDriverId && (
        <DriverDetailModal
          driverId={selectedDriverId}
          onClose={() => { setSelectedDriverId(null) }}
        />
      )}
    </div>
  )
}

function DriverDetailModal({ driverId, onClose }: { driverId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useDriverDetail(driverId)

  return (
    <Modal
      open={!!driverId}
      onClose={onClose}
      title={t('drivers.detailTitle', 'Driver Details & Order History')}
      className="max-w-2xl"
    >
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="space-y-6">
          {/* Driver profile summary */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {data.user.first_name} {data.user.last_name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('auth.phoneLabel')}: {data.user.phone}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Badge variant={data.user.is_active ? 'success' : 'neutral'}>
                {data.user.is_active ? t('common.active') : t('common.inactive')}
              </Badge>
              <Badge variant={data.user.is_online ? 'brand' : 'neutral'}>
                {data.user.is_online ? t('drivers.online', 'Online') : t('drivers.offline', 'Offline')}
              </Badge>
            </div>
          </div>

          {/* Orders Section */}
          <div>
            <h4 className="text-md font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              {t('drivers.ordersHistory', 'Delivery History')} ({data.orders.length})
            </h4>

            {data.orders.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                {t('drivers.noOrders', 'No orders assigned to this driver yet.')}
              </p>
            ) : (
              <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
                {data.orders.map((order) => (
                  <div key={order.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3 bg-white dark:bg-gray-900">
                    {/* Header: Order ID + Status */}
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          Order #{order.id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 block">
                          {new Date(order.placed_at).toLocaleString()}
                        </span>
                      </div>
                      <Badge variant={order.status === 'delivered' ? 'success' : order.status === 'cancelled' ? 'neutral' : 'brand'}>
                        {order.status}
                      </Badge>
                    </div>

                    {/* Store + Customer */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Store className="size-4 text-gray-400" />
                        <span><strong>From:</strong> {order.vendor.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <User className="size-4 text-gray-400" />
                        <span>
                          <strong>To:</strong> {order.customer.first_name} {order.customer.last_name} ({order.customer.phone})
                        </span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Payout:</strong> ${order.subtotal_display.toFixed(2)} {order.currency_code}
                    </div>

                    {/* Customer Comment */}
                    <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm">
                      <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        <Star className="size-4 text-yellow-500 fill-yellow-500" />
                        <span>{order.rating ? `${order.rating.score} / 5` : 'No rating'}</span>
                      </div>
                      {order.rating && order.rating.comment ? (
                        <p className="text-gray-600 dark:text-gray-400 italic">"{order.rating.comment}"</p>
                      ) : (
                        <p className="text-gray-400 dark:text-gray-500 italic">No comment left.</p>
                      )}
                    </div>

                    {/* Tracking History */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-brand-500" />
                        Tracking History ({order.tracking_history?.length ?? 0} points)
                      </span>
                      {order.tracking_history && order.tracking_history.length > 0 ? (
                        <div className="text-[11px] font-mono bg-gray-50 dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 max-h-32 overflow-y-auto space-y-1">
                          {order.tracking_history.map((t, idx) => (
                            <div key={idx} className="flex justify-between text-gray-500 dark:text-gray-400">
                              <span>
                                {new Date(t.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span>
                                Lat: {t.latitude.toFixed(6)}, Lng: {t.longitude.toFixed(6)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic block pl-5">
                          No location updates recorded for this order.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
