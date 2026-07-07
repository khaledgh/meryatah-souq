import { CheckCircle2, Clock, Layers, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { TextInput } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { CategoryRequest, CategoryRequestStatus } from '../../schemas/category-request'
import { useApproveCategoryRequest, useCategoryRequests, useRejectCategoryRequest } from './use-category-requests'

const statusBadgeVariant: Record<CategoryRequestStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const tabOrder: CategoryRequestStatus[] = ['pending', 'approved', 'rejected']

const tabIcon: Record<CategoryRequestStatus, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
}

function requestName(r: CategoryRequest): string {
  return r.name_i18n.en ?? Object.values(r.name_i18n)[0] ?? r.id
}

// Vendors can only REQUEST a new store/product category, never create one
// directly — this queue mirrors the vendor-applications approve/reject flow.
// Approving creates the requested category (super_admin's category CRUD
// pages then manage it going forward).
export function CategoryRequestsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<CategoryRequestStatus>('pending')
  const { data: requests, isLoading, isError, error, refetch } = useCategoryRequests(status)
  const approve = useApproveCategoryRequest()
  const reject = useRejectCategoryRequest()

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const columns: Column<CategoryRequest>[] = [
    {
      key: 'name',
      header: t('categoryRequests.name'),
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900 dark:text-gray-100">{requestName(r)}</p>
            <p className="truncate text-xs text-gray-400 dark:text-gray-500">
              {t(`categoryRequests.kinds.${r.kind}`)}{r.parent_id ? ` · ${t('productCategories.parent')}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: t('categoryRequests.vendor'),
      render: (r) => <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.vendor_id ?? '—'}</span>,
    },
    {
      key: 'notes',
      header: t('categoryRequests.notes'),
      render: (r) => <span className="text-xs text-gray-500 dark:text-gray-400">{r.notes ?? '—'}</span>,
    },
    {
      key: 'submitted',
      header: t('vendorApplications.submitted'),
      render: (r) => <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(r.submitted_at).toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: t('vendorApplications.status'),
      render: (r) => <Badge variant={statusBadgeVariant[r.status]}>{t(`categoryRequests.statusValues.${r.status}`)}</Badge>,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (r) => {
        if (r.status !== 'pending') {
          return r.reject_reason ? (
            <span className="text-xs italic text-gray-500 dark:text-gray-400">&ldquo;{r.reject_reason}&rdquo;</span>
          ) : null
        }
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              isLoading={approve.isPending && approve.variables === r.id}
              onClick={() => { approve.mutate(r.id) }}
            >
              {t('vendorApplications.approve')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setRejectingId(r.id)
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

  const rejectingRequest = requests?.find((r) => r.id === rejectingId) ?? null

  return (
    <div>
      <PageHeader title={t('categoryRequests.title')} description={t('categoryRequests.description')} />

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
              {t(`categoryRequests.statusValues.${tab}`)}
              {isActive ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>

      {approve.isError ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{toApiError(approve.error).user_message}</p>
      ) : null}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : requests && requests.length === 0 ? (
        <EmptyState message={t(`categoryRequests.emptyForStatus.${status}`)} />
      ) : (
        <DataTable columns={columns} rows={requests ?? []} rowKey={(r) => r.id} />
      )}

      <Modal
        open={rejectingRequest !== null}
        onClose={() => { setRejectingId(null) }}
        title={t('categoryRequests.rejectTitle', { name: rejectingRequest ? requestName(rejectingRequest) : '' })}
        description={t('vendorApplications.rejectDescription')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!rejectingRequest) return
            reject.mutate(
              { requestId: rejectingRequest.id, reason: rejectReason },
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
