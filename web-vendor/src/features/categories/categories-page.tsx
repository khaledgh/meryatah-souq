import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { vendorDisplayName } from '../../schemas/vendor'
import type { Category } from '../../schemas/catalog'
import { useVendor } from '../auth/auth-context'
import { useCategories, useCreateCategory, useDeleteCategory } from './use-categories'

// Blueprint §11.B6: Categories — list with name_i18n + sort order; CRUD.
// Drag-reorder is deferred; sort_order is set numerically on create (and
// editable via a follow-up inline edit). Deletion is guarded by a confirm.
export function CategoriesPage() {
  const { t, i18n } = useTranslation()
  const vendor = useVendor()
  const categories = useCategories(vendor.id)
  const createCategory = useCreateCategory(vendor.id)
  const deleteCategory = useDeleteCategory(vendor.id)

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sortOrder, setSortOrder] = useState(0)

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    const name_i18n: Record<string, string> = {}
    if (nameEn.trim()) name_i18n['en'] = nameEn.trim()
    if (nameAr.trim()) name_i18n['ar'] = nameAr.trim()
    createCategory.mutate(
      { name_i18n, sort_order: sortOrder },
      { onSuccess: () => { setNameEn(''); setNameAr(''); setSortOrder(0) } },
    )
  }

  const columns: Column<Category>[] = [
    { key: 'name', header: t('categories.name'), render: (c) => <span className="font-medium">{vendorDisplayName(c, i18n.language)}</span> },
    { key: 'sort', header: t('categories.sortOrder'), render: (c) => c.sort_order },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (c) => (
        <button
          type="button"
          onClick={() => { if (window.confirm(t('categories.confirmDelete'))) deleteCategory.mutate(c.id) }}
          className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
        >
          <Trash2 className="size-3.5" aria-hidden="true" /> {t('common.delete')}
        </button>
      ),
    },
  ]

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('categories.title')} description={t('categories.description')} />

      {categories.isLoading ? (
        <LoadingState />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : categories.data && categories.data.length === 0 ? (
        <EmptyState message={t('categories.empty')} />
      ) : (
        <DataTable columns={columns} rows={categories.data ?? []} rowKey={(c) => c.id} />
      )}
      {deleteCategory.isError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(deleteCategory.error).user_message}</p>
      ) : null}

      <Card className="mt-6">
        <CardHeader title={t('categories.createTitle')} />
        <CardBody>
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-4">
            <div className="w-44">
              <TextInput label={t('categories.nameEn')} required value={nameEn} onChange={(e) => { setNameEn(e.target.value) }} />
            </div>
            <div className="w-44">
              <TextInput label={t('categories.nameAr')} dir="rtl" value={nameAr} onChange={(e) => { setNameAr(e.target.value) }} />
            </div>
            <div className="w-24">
              <TextInput type="number" label={t('categories.sortOrder')} value={sortOrder} onChange={(e) => { setSortOrder(Number(e.target.value)) }} />
            </div>
            <Button type="submit" isLoading={createCategory.isPending}>{t('common.create')}</Button>
          </form>
          {createCategory.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createCategory.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
