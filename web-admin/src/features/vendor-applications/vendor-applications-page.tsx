import { Building2, CheckCircle2, Clock, MapPin, Phone, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { TextInput } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { VendorApplication, VendorApplicationStatus } from '../../schemas/vendor-application'
import { useApproveVendorApplication, useRejectVendorApplication, useVendorApplications } from './use-vendor-applications'

const statusBadgeVariant: Record<VendorApplicationStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const tabOrder: VendorApplicationStatus[] = ['pending', 'approved', 'rejected']

const tabIcon: Record<VendorApplicationStatus, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
}

function businessName(app: VendorApplication): string {
  return app.business_name_i18n.en ?? Object.values(app.business_name_i18n)[0] ?? app.id
}

// Blueprint §11.A5: Vendor Onboarding/Approval — pending applications
// queue; approve/reject with reason; approval creates vendor + owner user.
export function VendorApplicationsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<VendorApplicationStatus>('pending')
  const { data: applications, isLoading, isError, error, refetch } = useVendorApplications(status)
  const approve = useApproveVendorApplication()
  const reject = useRejectVendorApplication()

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approvedVendorId, setApprovedVendorId] = useState<string | null>(null)

  const columns: Column<VendorApplication>[] = [
    {
      key: 'business',
      header: t('vendorApplications.business'),
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            <Building2 className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900 dark:text-gray-100">{businessName(a)}</p>
            <p className="truncate text-xs text-gray-400 dark:text-gray-500">{a.category}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('vendorApplications.contact'),
      render: (a) => (
        <div>
          <p className="text-gray-700 dark:text-gray-300">{a.contact_first_name} {a.contact_last_name}</p>
          <p className="flex items-center gap-1 font-mono text-xs text-gray-400 dark:text-gray-500">
            <Phone className="size-3" aria-hidden="true" />
            {a.contact_phone}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: t('vendorApplications.location'),
      render: (a) => (
        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {a.address ?? `${a.latitude.toFixed(3)}, ${a.longitude.toFixed(3)}`}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: t('vendorApplications.submitted'),
      render: (a) => <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(a.submitted_at).toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: t('vendorApplications.status'),
      render: (a) => <Badge variant={statusBadgeVariant[a.status]}>{t(`vendorApplications.statusValues.${a.status}`)}</Badge>,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (a) => {
        if (a.status !== 'pending') {
          return a.reject_reason ? (
            <span className="text-xs italic text-gray-500 dark:text-gray-400">&ldquo;{a.reject_reason}&rdquo;</span>
          ) : null
        }
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              isLoading={approve.isPending && approve.variables === a.id}
              onClick={() => {
                approve.mutate(a.id, {
                  onSuccess: (vendor) => {
                    setApprovedVendorId(vendor.id)
                  },
                })
              }}
            >
              {t('vendorApplications.approve')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setRejectingId(a.id)
                setRejectReason('')
              }}
            >
              {t('vendorApplications.reject')}
            </Button>
          </div>
        )
      },
    },
  ]

  const rejectingApp = applications?.find((a) => a.id === rejectingId) ?? null
  const counts = {
    pending: status === 'pending' ? applications?.length : undefined,
    approved: status === 'approved' ? applications?.length : undefined,
    rejected: status === 'rejected' ? applications?.length : undefined,
  }

  return (
    <div>
      <PageHeader title={t('vendorApplications.title')} description={t('vendorApplications.description')} />

      <div className="mb-5 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-800">
        {tabOrder.map((tab) => {
          const Icon = tabIcon[tab]
          const isActive = status === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => { setStatus(tab) }}
              className={`relative flex items-center gap-1.5 px-3 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-700 dark:text-brand-300'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`vendorApplications.statusValues.${tab}`)}
              {typeof counts[tab] === 'number' ? (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {counts[tab]}
                </span>
              ) : null}
              {isActive ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>

      {approvedVendorId ? (
        <Card className="mb-4 border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('vendorApplications.approvedNotice')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/vendors/${approvedVendorId}`}>
                <Button size="sm" variant="secondary">{t('vendorApplications.viewVendor')}</Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => { setApprovedVendorId(null) }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {approve.isError ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{toApiError(approve.error).user_message}</p>
      ) : null}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : applications && applications.length === 0 ? (
        <EmptyState message={t(`vendorApplications.emptyForStatus.${status}`)} />
      ) : (
        <DataTable columns={columns} rows={applications ?? []} rowKey={(a) => a.id} />
      )}

      <Modal
        open={rejectingApp !== null}
        onClose={() => { setRejectingId(null) }}
        title={t('vendorApplications.rejectTitle', { name: rejectingApp ? businessName(rejectingApp) : '' })}
        description={t('vendorApplications.rejectDescription')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!rejectingApp) return
            reject.mutate(
              { applicationId: rejectingApp.id, reason: rejectReason },
              { onSuccess: () => { setRejectingId(null) } },
            )
          }}
          className="flex flex-col gap-4"
        >
          <TextInput
            label={t('vendorApplications.reasonLabel')}
            required
            autoFocus
            value={rejectReason}
            onChange={(e) => { setRejectReason(e.target.value) }}
            placeholder={t('vendorApplications.reasonPlaceholder')}
          />
          {reject.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(reject.error).user_message}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setRejectingId(null) }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" isLoading={reject.isPending}>
              {t('vendorApplications.confirmReject')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
