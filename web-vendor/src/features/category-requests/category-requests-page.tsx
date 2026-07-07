import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeVariant } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Select, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { CategoryRequest, CategoryRequestKind, CategoryRequestStatus } from '../../schemas/category-request'
import { useVendor } from '../auth/auth-context'
import { useCategoryRequests, useSubmitCategoryRequest } from './use-category-requests'

const statusBadgeVariant: Record<CategoryRequestStatus, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

function requestName(r: CategoryRequest): string {
  return r.name_i18n.en ?? Object.values(r.name_i18n)[0] ?? r.id
}

// Vendors can only REQUEST a new global store/product category — they
// cannot create one directly. This mirrors the per-vendor menu categories
// page's create form, but submits to an admin approve/reject queue instead
// of creating the row immediately.
export function CategoryRequestsPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const requests = useCategoryRequests(vendor.id)
  const submit = useSubmitCategoryRequest(vendor.id)

  const [kind, setKind] = useState<CategoryRequestKind>('product')
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [notes, setNotes] = useState('')

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    const name_i18n: Record<string, string> = {}
    if (nameEn.trim()) name_i18n.en = nameEn.trim()
    if (nameAr.trim()) name_i18n.ar = nameAr.trim()
    submit.mutate(
      { kind, name_i18n, notes: notes.trim() || undefined },
      { onSuccess: () => { setNameEn(''); setNameAr(''); setNotes('') } },
    )
  }

  const columns: Column<CategoryRequest>[] = [
    { key: 'name', header: t('categoryRequests.name'), render: requestName },
    { key: 'kind', header: t('categoryRequests.kind'), render: (r) => t(`categoryRequests.kinds.${r.kind}`) },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => <Badge variant={statusBadgeVariant[r.status]}>{t(`categoryRequests.statusValues.${r.status}`)}</Badge>,
    },
    {
      key: 'submitted',
      header: t('categoryRequests.submitted'),
      render: (r) => <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(r.submitted_at).toLocaleString()}</span>,
    },
    {
      key: 'note',
      header: t('categoryRequests.reason'),
      render: (r) => (r.reject_reason ? <span className="text-xs italic text-gray-500 dark:text-gray-400">&ldquo;{r.reject_reason}&rdquo;</span> : null),
    },
  ]

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('categoryRequests.title')} description={t('categoryRequests.description')} />

      {requests.isLoading ? (
        <LoadingState />
      ) : requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : requests.data && requests.data.length === 0 ? (
        <EmptyState message={t('categoryRequests.empty')} />
      ) : (
        <DataTable columns={columns} rows={requests.data ?? []} rowKey={(r) => r.id} />
      )}

      <Card className="mt-6">
        <CardHeader title={t('categoryRequests.createTitle')} description={t('categoryRequests.createHint')} />
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Select label={t('categoryRequests.kind')} value={kind} onChange={(e) => { setKind(e.target.value as CategoryRequestKind) }}>
                <option value="product">{t('categoryRequests.kinds.product')}</option>
                <option value="store">{t('categoryRequests.kinds.store')}</option>
              </Select>
            </div>
            <div className="w-44">
              <TextInput label={t('categoryRequests.nameEn')} required value={nameEn} onChange={(e) => { setNameEn(e.target.value) }} />
            </div>
            <div className="w-44">
              <TextInput label={t('categoryRequests.nameAr')} dir="rtl" value={nameAr} onChange={(e) => { setNameAr(e.target.value) }} />
            </div>
            <div className="w-56">
              <TextInput label={t('categoryRequests.notes')} value={notes} onChange={(e) => { setNotes(e.target.value) }} />
            </div>
            <Button type="submit" isLoading={submit.isPending}>{t('categoryRequests.submit')}</Button>
          </form>
          {submit.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(submit.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
