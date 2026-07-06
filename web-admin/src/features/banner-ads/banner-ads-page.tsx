import { ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Checkbox, TextInput } from '../../components/ui/input'
import { Modal } from '../../components/ui/modal'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { resolveMediaUrl } from '../../lib/media'
import type { BannerAd } from '../../schemas/banner-ad'
import {
  useBannerAds,
  useCreateBannerAd,
  useDeleteBannerAd,
  useSetBannerAdActive,
  useUpdateBannerAd,
} from './use-banner-ads'

// An RFC3339/ISO instant → the value a <input type="datetime-local"> expects
// (local wall-clock "YYYY-MM-DDTHH:mm", no zone). Returns '' for null/invalid.
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear().toString()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// A datetime-local value → RFC3339 UTC, or undefined when empty.
function localInputToIso(local: string): string | undefined {
  if (!local) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

interface AdFormState {
  file: File | null
  vendorId: string
  targetUrl: string
  isPaid: boolean
  priceUsd: string
  priority: string
  startsAt: string
  endsAt: string
}

const emptyForm: AdFormState = {
  file: null,
  vendorId: '',
  targetUrl: '',
  isPaid: false,
  priceUsd: '',
  priority: '0',
  startsAt: '',
  endsAt: '',
}

// Thumbnail that falls back to the placeholder icon both when there's no URL
// and when the image fails to load (broken link, media host unreachable),
// so a bad URL degrades gracefully instead of showing a broken-image glyph.
function AdThumbnail({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false)
  const resolved = resolveMediaUrl(url)
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt=""
        onError={() => { setFailed(true) }}
        className="h-10 w-16 rounded-md object-cover ring-1 ring-gray-200 dark:ring-gray-800"
      />
    )
  }
  return (
    <span className="flex h-10 w-16 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-700">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  )
}

function adToForm(ad: BannerAd): AdFormState {
  return {
    file: null,
    vendorId: ad.vendor_id ?? '',
    targetUrl: ad.target_url ?? '',
    isPaid: ad.is_paid,
    priceUsd: ad.price_usd != null ? ad.price_usd.toString() : '',
    priority: ad.priority.toString(),
    startsAt: isoToLocalInput(ad.starts_at),
    endsAt: isoToLocalInput(ad.ends_at),
  }
}

// Blueprint §11.A8: Banner Ads — list (image, vendor/platform, paid/price,
// priority, schedule, active); editor (upload image, target URL, is_paid,
// price, priority, start/end) in a modal opened from the header; create,
// edit, suspend/activate, delete.
export function BannerAdsPage() {
  const { t } = useTranslation()
  const { data: ads, isLoading, isError, error, refetch } = useBannerAds()
  const setActive = useSetBannerAdActive()
  const deleteAd = useDeleteBannerAd()
  const createAd = useCreateBannerAd()
  const updateAd = useUpdateBannerAd()

  // null = closed; { id: null } = create; { id } = edit that ad.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<AdFormState>(emptyForm)

  const isEdit = editing?.id != null
  const mutation = isEdit ? updateAd : createAd

  const openCreate = () => {
    setForm(emptyForm)
    setEditing({ id: null })
  }
  const openEdit = (ad: BannerAd) => {
    setForm(adToForm(ad))
    setEditing({ id: ad.id })
  }
  const close = () => {
    setEditing(null)
  }

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault()

    const shared = {
      vendorId: form.vendorId || undefined,
      targetUrl: form.targetUrl || undefined,
      isPaid: form.isPaid,
      priceUsd: form.isPaid && form.priceUsd ? Number(form.priceUsd) : undefined,
      priority: Number(form.priority) || 0,
      startsAt: localInputToIso(form.startsAt),
      endsAt: localInputToIso(form.endsAt),
    }

    const editId = editing?.id ?? null
    if (editId != null) {
      updateAd.mutate(
        { id: editId, file: form.file ?? undefined, ...shared },
        { onSuccess: close },
      )
    } else if (form.file) {
      // A new ad requires an image; an edit keeps the existing one if none picked.
      createAd.mutate({ file: form.file, ...shared }, { onSuccess: close })
    }
  }

  const columns: Column<BannerAd>[] = [
    {
      key: 'image',
      header: t('bannerAds.image'),
      render: (a) => <AdThumbnail url={a.image_url} />,
    },
    { key: 'target', header: t('bannerAds.target'), render: (a) => a.vendor_id ?? t('bannerAds.platformWide') },
    {
      key: 'paid',
      header: t('bannerAds.paid'),
      render: (a) => (a.is_paid ? <Badge variant="brand">{t('common.yes')}</Badge> : <span className="text-gray-400 dark:text-gray-600">{t('common.no')}</span>),
    },
    {
      key: 'price',
      header: t('bannerAds.price'),
      render: (a) => (a.price_usd != null ? `$${a.price_usd.toFixed(2)}` : <span className="text-gray-400 dark:text-gray-600">—</span>),
    },
    { key: 'priority', header: t('bannerAds.priority'), render: (a) => a.priority },
    {
      key: 'schedule',
      header: t('bannerAds.schedule'),
      render: (a) =>
        a.starts_at || a.ends_at ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {a.starts_at ? new Date(a.starts_at).toLocaleString() : '—'}
            {' → '}
            {a.ends_at ? new Date(a.ends_at).toLocaleString() : '—'}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">{t('bannerAds.always')}</span>
        ),
    },
    {
      key: 'status',
      header: t('common.active'),
      render: (a) => (
        <button
          type="button"
          onClick={() => {
            setActive.mutate({ id: a.id, active: !a.is_active })
          }}
          title={a.is_active ? t('common.suspend') : t('common.activate')}
        >
          <Badge variant={a.is_active ? 'success' : 'neutral'}>{a.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (a) => (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => { openEdit(a) }}
            className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('common.confirmDelete'))) {
                deleteAd.mutate(a.id)
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
        title={t('nav.bannerAds')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t('bannerAds.create')}
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={ads ?? []} rowKey={(a) => a.id} />
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={isEdit ? t('bannerAds.editTitle') : t('bannerAds.createTitle')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
            {t('bannerAds.image')}
            {isEdit ? <span className="text-xs text-gray-400 dark:text-gray-500">{t('bannerAds.imageKeepHint')}</span> : null}
            <input
              type="file"
              accept="image/*"
              required={!isEdit}
              onChange={(e) => {
                setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
              }}
              className="text-xs text-gray-500 file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-950 dark:file:text-brand-300"
            />
          </label>

          <TextInput
            label={t('common.vendorIdOptional')}
            value={form.vendorId}
            onChange={(e) => { setForm((f) => ({ ...f, vendorId: e.target.value })) }}
          />
          <TextInput
            label={t('bannerAds.targetUrl')}
            value={form.targetUrl}
            onChange={(e) => { setForm((f) => ({ ...f, targetUrl: e.target.value })) }}
          />

          <div className="flex items-end gap-4">
            <div className="pb-2">
              <Checkbox
                id="is_paid"
                label={t('bannerAds.paid')}
                checked={form.isPaid}
                onChange={(e) => { setForm((f) => ({ ...f, isPaid: e.target.checked })) }}
              />
            </div>
            <div className="flex-1">
              <TextInput
                type="number"
                min={0}
                step="0.01"
                label={t('bannerAds.price')}
                disabled={!form.isPaid}
                value={form.priceUsd}
                onChange={(e) => { setForm((f) => ({ ...f, priceUsd: e.target.value })) }}
              />
            </div>
            <div className="w-24">
              <TextInput
                type="number"
                label={t('bannerAds.priority')}
                value={form.priority}
                onChange={(e) => { setForm((f) => ({ ...f, priority: e.target.value })) }}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <TextInput
                type="datetime-local"
                label={t('bannerAds.startsAt')}
                value={form.startsAt}
                onChange={(e) => { setForm((f) => ({ ...f, startsAt: e.target.value })) }}
              />
            </div>
            <div className="flex-1">
              <TextInput
                type="datetime-local"
                label={t('bannerAds.endsAt')}
                value={form.endsAt}
                onChange={(e) => { setForm((f) => ({ ...f, endsAt: e.target.value })) }}
              />
            </div>
          </div>

          {mutation.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(mutation.error).user_message}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={mutation.isPending} disabled={!isEdit && !form.file}>
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
