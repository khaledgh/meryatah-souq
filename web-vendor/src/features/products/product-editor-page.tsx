import { ArrowLeft, ImageIcon, Trash2, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Select, Textarea, TextInput } from '../../components/ui/input'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { vendorDisplayName } from '../../schemas/vendor'
import { useVendor } from '../auth/auth-context'
import { useCategories } from '../categories/use-categories'
import {
  useAddProductImage,
  useCreateProduct,
  useProduct,
  useRemoveProductImage,
  useUpdateProduct,
  type ProductInput,
} from './use-products'

// Blueprint §11.B8: Product editor — name_i18n & description_i18n per-locale,
// price in USD (canonical) with converted preview, stock, category,
// multi-image uploader (storage pipeline §5.9). Price is authored in USD
// only; the converted display value is computed server-side and shown once
// the product exists (its response carries display_price/display_currency).
export function ProductEditorPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const vendor = useVendor()
  const { productId } = useParams<{ productId: string }>()
  const isNew = productId === undefined

  const categories = useCategories(vendor.id)
  const existing = useProduct(isNew ? undefined : productId)
  const createProduct = useCreateProduct(vendor.id)
  const updateProduct = useUpdateProduct(vendor.id)

  if (!isNew && existing.isLoading) return <LoadingState />
  if (!isNew && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />

  return (
    <ProductForm
      key={existing.data?.id ?? 'new'}
      titleKey={isNew ? 'products.newTitle' : 'products.editTitle'}
      initial={existing.data}
      categoryOptions={(categories.data ?? []).map((c) => ({ id: c.id, name: vendorDisplayName(c, i18n.language) }))}
      onSubmit={(input, onDone) => {
        if (isNew) {
          createProduct.mutate(input, {
            onSuccess: (created) => { void navigate(`/products/${created.id}`, { replace: true }) },
          })
        } else if (productId) {
          updateProduct.mutate({ productId, ...input }, { onSuccess: onDone })
        }
      }}
      isSaving={createProduct.isPending || updateProduct.isPending}
      saveError={createProduct.error ?? updateProduct.error}
      vendorId={vendor.id}
      productId={isNew ? undefined : productId}
    />
  )
}

interface CategoryOption {
  id: string
  name: string
}

function ProductForm({
  titleKey,
  initial,
  categoryOptions,
  onSubmit,
  isSaving,
  saveError,
  vendorId,
  productId,
}: {
  titleKey: string
  initial: ReturnType<typeof useProduct>['data']
  categoryOptions: CategoryOption[]
  onSubmit: (input: ProductInput, onDone: () => void) => void
  isSaving: boolean
  saveError: unknown
  vendorId: string
  productId: string | undefined
}) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const [nameEn, setNameEn] = useState(initial?.name_i18n['en'] ?? '')
  const [nameAr, setNameAr] = useState(initial?.name_i18n['ar'] ?? '')
  const [descEn, setDescEn] = useState(initial?.description_i18n['en'] ?? '')
  const [descAr, setDescAr] = useState(initial?.description_i18n['ar'] ?? '')
  const [priceUsd, setPriceUsd] = useState(initial?.price_usd ?? 0)
  const [stock, setStock] = useState(initial?.stock ?? 0)
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const name_i18n: Record<string, string> = {}
    if (nameEn.trim()) name_i18n['en'] = nameEn.trim()
    if (nameAr.trim()) name_i18n['ar'] = nameAr.trim()
    const description_i18n: Record<string, string> = {}
    if (descEn.trim()) description_i18n['en'] = descEn.trim()
    if (descAr.trim()) description_i18n['ar'] = descAr.trim()

    onSubmit(
      {
        name_i18n,
        description_i18n,
        price_usd: priceUsd,
        stock,
        category_id: categoryId || null,
      },
      () => { setSaved(true) },
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t(titleKey)}
        actions={
          <Link to="/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="size-4" aria-hidden="true" /> {t('products.backToList')}
          </Link>
        }
      />

      <form onSubmit={onFormSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('products.details')} />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label={t('products.nameEn')} required value={nameEn} onChange={(e) => { setNameEn(e.target.value) }} />
              <TextInput label={t('products.nameAr')} dir="rtl" value={nameAr} onChange={(e) => { setNameAr(e.target.value) }} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea label={t('products.descEn')} rows={3} value={descEn} onChange={(e) => { setDescEn(e.target.value) }} />
              <Textarea label={t('products.descAr')} dir="rtl" rows={3} value={descAr} onChange={(e) => { setDescAr(e.target.value) }} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <TextInput
                  type="number"
                  step="0.01"
                  min={0}
                  label={t('products.priceUsd')}
                  required
                  value={priceUsd}
                  onChange={(e) => { setPriceUsd(Number(e.target.value)) }}
                />
                {initial && initial.display_currency !== 'USD' && initial.display_price !== undefined ? (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {t('products.converted')}: {initial.display_price.toFixed(2)} {initial.display_currency}
                  </p>
                ) : null}
              </div>
              <TextInput type="number" min={0} label={t('products.stock')} required value={stock} onChange={(e) => { setStock(Number(e.target.value)) }} />
              <Select label={t('products.category')} value={categoryId} onChange={(e) => { setCategoryId(e.target.value) }}>
                <option value="">{t('products.noCategory')}</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={isSaving}>{t('common.save')}</Button>
          {saved ? <span className="text-sm text-green-700 dark:text-green-400">{t('common.saved')}</span> : null}
          {saveError ? <span className="text-sm text-red-600 dark:text-red-400">{toApiError(saveError).user_message}</span> : null}
        </div>
      </form>

      {productId ? <ProductImages vendorId={vendorId} productId={productId} images={initial?.images ?? []} /> : (
        <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">{t('products.imagesAfterSave')}</p>
      )}
    </div>
  )
}

function ProductImages({
  vendorId,
  productId,
  images,
}: {
  vendorId: string
  productId: string
  images: NonNullable<ReturnType<typeof useProduct>['data']>['images']
}) {
  const { t } = useTranslation()
  const addImage = useAddProductImage(vendorId)
  const removeImage = useRemoveProductImage(vendorId)

  return (
    <Card className="mt-6">
      <CardHeader title={t('products.images')} description={t('products.imagesHint')} />
      <CardBody className="flex flex-col gap-4">
        {images && images.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {images.map((img) => (
              <div key={img.id} className="group relative">
                {img.url ? (
                  <img src={img.url} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-800" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-lg bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-700">
                    <ImageIcon className="size-5" aria-hidden="true" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { removeImage.mutate({ productId, imageId: img.id }) }}
                  className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-md bg-white/90 text-red-600 shadow ring-1 ring-gray-200 hover:bg-white dark:bg-gray-900/90 dark:ring-gray-700"
                  aria-label={t('common.remove')}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('products.noImages')}</p>
        )}

        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <Upload className="size-4" aria-hidden="true" />
          {addImage.isPending ? t('common.loading') : t('products.uploadImage')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) addImage.mutate({ productId, file })
              e.target.value = ''
            }}
          />
        </label>
        {(addImage.isError || removeImage.isError) ? (
          <p className="text-sm text-red-600 dark:text-red-400">{toApiError(addImage.error ?? removeImage.error).user_message}</p>
        ) : null}
      </CardBody>
    </Card>
  )
}
