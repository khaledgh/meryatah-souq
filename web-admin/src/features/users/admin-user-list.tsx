import { Plus, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
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
import { useAdminUsers, useCreateDriver, useCreateUser, useResetLockout, useSetUserActive, type CreateUserInput } from './use-admin-users'

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
    </div>
  )
}
