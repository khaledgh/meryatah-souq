import { ImageIcon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { BannerAd } from '../../schemas/banner-ad'
import { useBannerAds, useCreateBannerAd, useDeleteBannerAd, useSetBannerAdActive } from './use-banner-ads'

// Blueprint §11.A8: Banner Ads — list (image, vendor/platform, paid/free,
// priority, schedule, active); editor (upload image, target URL, is_paid,
// priority, start/end); create/edit/delete/toggle. Editing an existing
// ad's fields (other than active) is deferred: the backend only exposes
// create/toggle-active/delete, no PATCH for target_url/priority/schedule.
export function BannerAdsPage() {
  const { t } = useTranslation()
  const { data: ads, isLoading, isError, error, refetch } = useBannerAds()
  const setActive = useSetBannerAdActive()
  const deleteAd = useDeleteBannerAd()
  const createAd = useCreateBannerAd()

  const [file, setFile] = useState<File | null>(null)
  const [vendorId, setVendorId] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [priority, setPriority] = useState(0)

  const columns: Column<BannerAd>[] = [
    {
      key: 'image',
      header: t('bannerAds.image'),
      render: (a) =>
        a.image_url ? (
          <img src={a.image_url} alt="" className="h-10 w-16 rounded-md object-cover ring-1 ring-gray-200 dark:ring-gray-800" />
        ) : (
          <span className="flex h-10 w-16 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-700">
            <ImageIcon className="size-4" aria-hidden="true" />
          </span>
        ),
    },
    { key: 'target', header: t('bannerAds.target'), render: (a) => a.vendor_id ?? t('bannerAds.platformWide') },
    {
      key: 'paid',
      header: t('bannerAds.paid'),
      render: (a) => (a.is_paid ? <Badge variant="brand">{t('common.yes')}</Badge> : <span className="text-gray-400 dark:text-gray-600">{t('common.no')}</span>),
    },
    { key: 'priority', header: t('bannerAds.priority'), render: (a) => a.priority },
    {
      key: 'status',
      header: t('common.active'),
      render: (a) => (
        <button
          type="button"
          onClick={() => {
            setActive.mutate({ id: a.id, active: !a.is_active })
          }}
        >
          <Badge variant={a.is_active ? 'success' : 'neutral'}>{a.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (a) => (
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
      ),
    },
  ]

  return (
    <div>
      <PageHeader title={t('nav.bannerAds')} />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={ads ?? []} rowKey={(a) => a.id} />
      )}

      <Card className="mt-6">
        <CardHeader title={t('bannerAds.createTitle')} />
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!file) return
              createAd.mutate(
                { file, vendorId: vendorId || undefined, targetUrl: targetUrl || undefined, isPaid, priority },
                {
                  onSuccess: () => {
                    setFile(null)
                    setVendorId('')
                    setTargetUrl('')
                    setIsPaid(false)
                    setPriority(0)
                  },
                },
              )
            }}
            className="flex flex-wrap items-end gap-4"
          >
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              {t('bannerAds.image')}
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                }}
                className="text-xs text-gray-500 file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-950 dark:file:text-brand-300"
              />
            </label>
            <div className="w-40">
              <TextInput
                label={t('common.vendorIdOptional')}
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value)
                }}
              />
            </div>
            <div className="w-56">
              <TextInput
                label={t('bannerAds.targetUrl')}
                value={targetUrl}
                onChange={(e) => {
                  setTargetUrl(e.target.value)
                }}
              />
            </div>
            <div className="w-24">
              <TextInput
                type="number"
                label={t('bannerAds.priority')}
                value={priority}
                onChange={(e) => {
                  setPriority(Number(e.target.value))
                }}
              />
            </div>
            <Checkbox
              id="is_paid"
              label={t('bannerAds.paid')}
              checked={isPaid}
              onChange={(e) => {
                setIsPaid(e.target.checked)
              }}
            />
            <Button type="submit" isLoading={createAd.isPending} disabled={!file}>
              {t('common.create')}
            </Button>
          </form>
          {createAd.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createAd.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
