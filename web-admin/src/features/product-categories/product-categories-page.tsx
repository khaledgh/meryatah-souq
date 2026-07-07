import { ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Select, TextInput } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { resolveMediaUrl } from '../../lib/media'
import { useStoreCategories } from '../store-categories/use-store-categories'
import type { ProductCategory } from '../../schemas/product-category'
import {
  useCreateProductCategory,
  useDeleteProductCategory,
  useProductCategories,
  useSetProductCategoryActive,
  useUpdateProductCategory,
} from './use-product-categories'

interface FormState {
  file: File | null
  nameEn: string
  nameAr: string
  slug: string
  parentId: string
  storeCategoryId: string
  sortOrder: string
}

const emptyForm: FormState = {
  file: null,
  nameEn: '',
  nameAr: '',
  slug: '',
  parentId: '',
  storeCategoryId: '',
  sortOrder: '0',
}

function categoryToForm(c: ProductCategory): FormState {
  return {
    file: null,
    nameEn: c.name_i18n.en ?? '',
    nameAr: c.name_i18n.ar ?? '',
    slug: c.slug,
    parentId: c.parent_id ?? '',
    storeCategoryId: c.store_category_id ?? '',
    sortOrder: c.sort_order.toString(),
  }
}

function CategoryIcon({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false)
  const resolved = resolveMediaUrl(url)
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt=""
        onError={() => { setFailed(true) }}
        className="size-10 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-800"
      />
    )
  }
  return (
    <span className="flex size-10 items-center justify-center rounded-lg bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-700">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  )
}

// Product categories: the admin-managed GLOBAL product taxonomy (Drinks,
// Laptops, Leafy Greens, ...), with subcategories via a self-referencing
// parent. Entirely separate from the vendor-scoped per-store "categories"
// (menu sections) managed on the vendor dashboard — do not confuse the two.
export function ProductCategoriesPage() {
  const { t } = useTranslation()
  const { data: categories, isLoading, isError, error, refetch } = useProductCategories()
  const { data: storeCategories } = useStoreCategories()
  const setActive = useSetProductCategoryActive()
  const deleteCategory = useDeleteProductCategory()
  const createCategory = useCreateProductCategory()
  const updateCategory = useUpdateProductCategory()

  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const isEdit = editing?.id != null
  const mutation = isEdit ? updateCategory : createCategory

  const openCreate = () => {
    setForm(emptyForm)
    setEditing({ id: null })
  }
  const openEdit = (c: ProductCategory) => {
    setForm(categoryToForm(c))
    setEditing({ id: c.id })
  }
  const close = () => { setEditing(null) }

  const categoryName = (c: ProductCategory) => c.name_i18n.en ?? c.slug
  const parentName = (parentId: string | null | undefined) => {
    if (!parentId) return null
    const parent = categories?.find((c) => c.id === parentId)
    return parent ? categoryName(parent) : null
  }

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const nameI18n: Record<string, string> = {}
    if (form.nameEn.trim()) nameI18n.en = form.nameEn.trim()
    if (form.nameAr.trim()) nameI18n.ar = form.nameAr.trim()

    const shared = {
      nameI18n,
      slug: form.slug,
      parentId: form.parentId || undefined,
      storeCategoryId: form.storeCategoryId || undefined,
      sortOrder: Number(form.sortOrder) || 0,
      file: form.file ?? undefined,
    }

    const editId = editing?.id ?? null
    if (editId != null) {
      updateCategory.mutate({ id: editId, ...shared }, { onSuccess: close })
    } else {
      createCategory.mutate(shared, { onSuccess: close })
    }
  }

  const columns: Column<ProductCategory>[] = [
    { key: 'icon', header: t('productCategories.icon'), render: (c) => <CategoryIcon url={c.icon_url} /> },
    { key: 'name', header: t('common.name'), render: categoryName },
    { key: 'slug', header: t('productCategories.slug'), render: (c) => <span className="font-mono text-xs">{c.slug}</span> },
    {
      key: 'parent',
      header: t('productCategories.parent'),
      render: (c) => parentName(c.parent_id) ?? <span className="text-gray-400 dark:text-gray-600">{t('productCategories.topLevel')}</span>,
    },
    { key: 'sort', header: t('common.sortOrder'), render: (c) => c.sort_order },
    {
      key: 'status',
      header: t('common.active'),
      render: (c) => (
        <button
          type="button"
          onClick={() => { setActive.mutate({ id: c.id, active: !c.is_active }) }}
          title={c.is_active ? t('common.suspend') : t('common.activate')}
        >
          <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (c) => (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => { openEdit(c) }}
            className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('common.confirmDelete'))) {
                deleteCategory.mutate(c.id)
              }
            }}
            className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> {t('common.delete')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('nav.productCategories')}
        description={t('productCategories.description')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t('productCategories.create')}
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={categories ?? []} rowKey={(c) => c.id} />
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={isEdit ? t('productCategories.editTitle') : t('productCategories.createTitle')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
            {t('productCategories.icon')}
            {isEdit ? <span className="text-xs text-gray-400 dark:text-gray-500">{t('productCategories.iconKeepHint')}</span> : null}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null })) }}
              className="text-xs text-gray-500 file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-950 dark:file:text-brand-300"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t('productCategories.nameEn')}
              required
              value={form.nameEn}
              onChange={(e) => { setForm((f) => ({ ...f, nameEn: e.target.value })) }}
            />
            <TextInput
              label={t('productCategories.nameAr')}
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => { setForm((f) => ({ ...f, nameAr: e.target.value })) }}
            />
          </div>

          <TextInput
            label={t('productCategories.slug')}
            required
            value={form.slug}
            onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })) }}
          />

          <div className="flex gap-4">
            <div className="flex-1">
              <Select
                label={t('productCategories.parent')}
                value={form.parentId}
                onChange={(e) => { setForm((f) => ({ ...f, parentId: e.target.value })) }}
              >
                <option value="">{t('productCategories.topLevel')}</option>
                {categories?.filter((c) => c.id !== editing?.id).map((c) => (
                  <option key={c.id} value={c.id}>{categoryName(c)}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select
                label={t('storeCategories.title')}
                value={form.storeCategoryId}
                onChange={(e) => { setForm((f) => ({ ...f, storeCategoryId: e.target.value })) }}
              >
                <option value="">{t('common.none')}</option>
                {storeCategories?.map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name_i18n.en ?? sc.slug}</option>
                ))}
              </Select>
            </div>
            <div className="w-24">
              <TextInput
                type="number"
                label={t('common.sortOrder')}
                value={form.sortOrder}
                onChange={(e) => { setForm((f) => ({ ...f, sortOrder: e.target.value })) }}
              />
            </div>
          </div>

          {mutation.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(mutation.error).user_message}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={mutation.isPending}>
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
