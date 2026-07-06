import { CalendarClock, KeyRound, Pencil, Power, Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { TextInput as Input } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { vendorDisplayName, type Vendor } from '../../schemas/vendor'
import { useSetUserPassword, useVendorOwners } from '../users/use-admin-users'
import { useSetVendorActive, useCreateVendor, useVendors } from './use-vendors'

interface VendorFormValues {
  owner_user_id: string
  name_en: string
  name_ar: string
  category: string
  address: string
  longitude: number
  latitude: number
  timezone: string
}

export function VendorsPage() {
  const { t, i18n } = useTranslation()
  const { data: vendors, isLoading, isError, error, refetch } = useVendors()
  const setActive = useSetVendorActive()
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: owners } = useVendorOwners()
  const createVendor = useCreateVendor()

  // Set-password modal for a vendor's owner account (enables password login
  // when the admin selects "password" as the vendor login method).
  const setPassword = useSetUserPassword()
  const [passwordTarget, setPasswordTarget] = useState<Vendor | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<VendorFormValues>({
    defaultValues: {
      longitude: 35.5,
      latitude: 33.9,
      timezone: 'Asia/Beirut',
      category: 'grocery',
    },
  })

  const onSubmit = async (data: VendorFormValues) => {
    try {
      await createVendor.mutateAsync({
        owner_user_id: data.owner_user_id,
        name_i18n: { en: data.name_en, ar: data.name_ar },
        category: data.category,
        address: data.address,
        longitude: data.longitude,
        latitude: data.latitude,
        timezone: data.timezone,
      })
      setIsModalOpen(false)
      reset()
    } catch {
      // error handled by api client
    }
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const columns: Column<Vendor>[] = [
    { key: 'name', header: t('common.name'), render: (v) => vendorDisplayName(v, i18n.language) },
    { key: 'category', header: t('common.category'), render: (v) => v.category },
    {
      key: 'status',
      header: t('common.active'),
      render: (v) => <Badge variant={v.is_active ? 'success' : 'neutral'}>{v.is_active ? t('common.active') : t('common.inactive')}</Badge>,
    },
    {
      key: 'commission',
      header: t('vendors.commissionPct'),
      render: (v) => (v.commission_pct != null ? `${v.commission_pct.toString()}%` : t('vendors.appDefault')),
    },
    {
      key: 'scheduling',
      header: t('vendors.scheduling'),
      render: (v) =>
        v.scheduling_allowed ? (
          <Badge variant="brand">
            <CalendarClock className="size-3" aria-hidden="true" /> {t('common.yes')}
          </Badge>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">{t('common.no')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (v) => (
        <div className="flex items-center gap-3">
          <Link
            to={`/vendors/${v.id}`}
            className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> {t('common.edit')}
          </Link>
          <button
            type="button"
            onClick={() => {
              setActive.mutate({ vendorId: v.id, active: !v.is_active })
            }}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Power className="size-3.5" aria-hidden="true" /> {v.is_active ? t('common.inactive') : t('common.active')}
          </button>
          <button
            type="button"
            onClick={() => {
              setNewPassword('')
              setPassword.reset()
              setPasswordTarget(v)
            }}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <KeyRound className="size-3.5" aria-hidden="true" /> {t('vendors.setPassword')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('nav.vendors')}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/vendor-applications">
              <Button size="sm" variant="secondary">
                <UserPlus className="size-4" aria-hidden="true" /> {t('nav.vendorApplications', { defaultValue: 'Approve Applications' })}
              </Button>
            </Link>
            <Button size="sm" onClick={() => { setIsModalOpen(true) }}>
              <Plus className="size-4" aria-hidden="true" /> {t('vendors.addVendor')}
            </Button>
          </div>
        }
      />
      <DataTable columns={columns} rows={vendors ?? []} rowKey={(v) => v.id} />

      <Modal
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false) }}
        title={t('vendors.addVendor', { defaultValue: 'Create Vendor' })}
      >
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Owner
            </label>
            <select
              {...register('owner_user_id', { required: true })}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-brand-400 dark:focus:ring-brand-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            >
              <option value="">-- Select Owner --</option>
              {owners?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.first_name} {o.last_name} ({o.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Name (English)" {...register('name_en', { required: true })} required />
            <Input label="Name (Arabic)" {...register('name_ar', { required: true })} required dir="rtl" />
          </div>

          <Input label="Category" {...register('category', { required: true })} required />
          <Input label="Address" {...register('address')} />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Longitude" type="number" step="any" {...register('longitude', { required: true, valueAsNumber: true })} required />
            <Input label="Latitude" type="number" step="any" {...register('latitude', { required: true, valueAsNumber: true })} required />
          </div>

          <Input label="Timezone" {...register('timezone', { required: true })} required />

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
              {t('common.create', { defaultValue: 'Create' })}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={passwordTarget !== null}
        onClose={() => { setPasswordTarget(null) }}
        title={t('vendors.setPasswordTitle', { name: passwordTarget ? vendorDisplayName(passwordTarget, i18n.language) : '' })}
        description={t('vendors.setPasswordDescription')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!passwordTarget) return
            setPassword.mutate(
              { userId: passwordTarget.owner_user_id, password: newPassword },
              { onSuccess: () => { setPasswordTarget(null) } },
            )
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('auth.passwordLabel')}
            type="password"
            required
            minLength={8}
            autoFocus
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value) }}
            placeholder={t('vendors.setPasswordPlaceholder')}
          />
          {setPassword.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(setPassword.error).user_message}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setPasswordTarget(null) }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={setPassword.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
