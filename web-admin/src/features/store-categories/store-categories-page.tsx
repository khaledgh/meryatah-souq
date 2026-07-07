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
import type { StoreCategory, TemplateKind } from '../../schemas/store-category'
import {
  useCreateStoreCategory,
  useDeleteStoreCategory,
  useSetStoreCategoryActive,
  useStoreCategories,
  useUpdateStoreCategory,
} from './use-store-categories'

interface FormState {
  file: File | null
  nameEn: string
  nameAr: string
  slug: string
  templateKind: TemplateKind
  accentColor: string
  sortOrder: string
}

const emptyForm: FormState = {
  file: null,
  nameEn: '',
  nameAr: '',
  slug: '',
  templateKind: 'generic',
  accentColor: '',
  sortOrder: '0',
}

function categoryToForm(c: StoreCategory): FormState {
  return {
    file: null,
    nameEn: c.name_i18n.en ?? '',
    nameAr: c.name_i18n.ar ?? '',
    slug: c.slug,
    templateKind: c.template_kind,
    accentColor: c.accent_color ?? '',
    sortOrder: c.sort_order.toString(),
  }
}

// Same graceful-fallback thumbnail pattern as banner ads.
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

// Store categories: the admin-managed marketplace sections (Food,
// Electronics, Market, ...) vendors belong to. Vendors can only REQUEST a
// new one (see category-requests) — only super_admin creates/edits here.
export function StoreCategoriesPage() {
  const { t } = useTranslation()
  const { data: categories, isLoading, isError, error, refetch } = useStoreCategories()
  const setActive = useSetStoreCategoryActive()
  const deleteCategory = useDeleteStoreCategory()
  const createCategory = useCreateStoreCategory()
  const updateCategory = useUpdateStoreCategory()

  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const isEdit = editing?.id != null
  const mutation = isEdit ? updateCategory : createCategory

  const openCreate = () => {
    setForm(emptyForm)
    setEditing({ id: null })
  }
  const openEdit = (c: StoreCategory) => {
    setForm(categoryToForm(c))
    setEditing({ id: c.id })
  }
  const close = () => { setEditing(null) }

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const nameI18n: Record<string, string> = {}
    if (form.nameEn.trim()) nameI18n.en = form.nameEn.trim()
    if (form.nameAr.trim()) nameI18n.ar = form.nameAr.trim()

    const shared = {
      nameI18n,
      slug: form.slug,
      templateKind: form.templateKind,
      accentColor: form.accentColor || undefined,
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

  const columns: Column<StoreCategory>[] = [
    { key: 'icon', header: t('storeCategories.icon'), render: (c) => <CategoryIcon url={c.icon_url} /> },
    { key: 'name', header: t('common.name'), render: (c) => c.name_i18n.en ?? c.slug },
    { key: 'slug', header: t('storeCategories.slug'), render: (c) => <span className="font-mono text-xs">{c.slug}</span> },
    { key: 'template', header: t('storeCategories.templateKind'), render: (c) => t(`storeCategories.templateKinds.${c.template_kind}`) },
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
        title={t('nav.storeCategories')}
        description={t('storeCategories.description')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t('storeCategories.create')}
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={categories ?? []} rowKey={(c) => c.id} />
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={isEdit ? t('storeCategories.editTitle') : t('storeCategories.createTitle')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
            {t('storeCategories.icon')}
            {isEdit ? <span className="text-xs text-gray-400 dark:text-gray-500">{t('storeCategories.iconKeepHint')}</span> : null}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null })) }}
              className="text-xs text-gray-500 file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-950 dark:file:text-brand-300"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t('storeCategories.nameEn')}
              required
              value={form.nameEn}
              onChange={(e) => { setForm((f) => ({ ...f, nameEn: e.target.value })) }}
            />
            <TextInput
              label={t('storeCategories.nameAr')}
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => { setForm((f) => ({ ...f, nameAr: e.target.value })) }}
            />
          </div>

          <TextInput
            label={t('storeCategories.slug')}
            required
            value={form.slug}
            onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })) }}
          />

          <div className="flex gap-4">
            <div className="flex-1">
              <Select
                label={t('storeCategories.templateKind')}
                value={form.templateKind}
                onChange={(e) => { setForm((f) => ({ ...f, templateKind: e.target.value as TemplateKind })) }}
              >
                <option value="generic">{t('storeCategories.templateKinds.generic')}</option>
                <option value="food">{t('storeCategories.templateKinds.food')}</option>
                <option value="electronics">{t('storeCategories.templateKinds.electronics')}</option>
                <option value="market">{t('storeCategories.templateKinds.market')}</option>
              </Select>
            </div>
            <div className="w-32">
              <TextInput
                label={t('storeCategories.accentColor')}
                placeholder="#f59e0b"
                value={form.accentColor}
                onChange={(e) => { setForm((f) => ({ ...f, accentColor: e.target.value })) }}
              />
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
