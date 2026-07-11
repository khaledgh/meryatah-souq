import { ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { resolveMediaUrl } from '../../lib/media'
import { vendorDisplayName } from '../../schemas/vendor'
import type { Product } from '../../schemas/catalog'
import { useVendor } from '../auth/auth-context'
import { useDeleteProduct, useProducts, useUpdateProduct } from './use-products'

// Thumbnail that falls back to the placeholder icon both when there's no URL
// and when the image fails to load (broken link, media host unreachable),
// so a bad URL degrades gracefully instead of showing a broken-image glyph.
function ProductThumbnail({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false)
  const resolved = resolveMediaUrl(url)
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt=""
        onError={() => { setFailed(true) }}
        className="h-10 w-10 rounded-md object-cover ring-1 ring-gray-200 dark:ring-gray-800"
      />
    )
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-700">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  )
}

// Blueprint §11.B7: Products — table (image, name, price USD + converted,
// stock, active). Create/edit open the editor (B8); toggle active and
// delete are inline. Search/filter is deferred until the backend list
// endpoint supports it (currently returns all products for the vendor).
export function ProductsPage() {
  const { t, i18n } = useTranslation()
  const vendor = useVendor()
  const products = useProducts(vendor.id)
  const updateProduct = useUpdateProduct(vendor.id)
  const deleteProduct = useDeleteProduct(vendor.id)

  const primaryImage = (p: Product) => p.images?.find((img) => img.url)?.url

  const columns: Column<Product>[] = [
    {
      key: 'image',
      header: t('products.image'),
      render: (p) => <ProductThumbnail url={primaryImage(p)} />,
    },
    { key: 'name', header: t('products.name'), render: (p) => <span className="font-medium">{vendorDisplayName(p, i18n.language)}</span> },
    {
      key: 'price',
      header: t('products.price'),
      render: (p) => (
        <div className="text-sm">
          <span className="font-medium">${p.price_usd.toFixed(2)}</span>
          {p.display_currency !== 'USD' && p.display_price !== undefined ? (
            <span className="ms-1.5 text-xs text-gray-400 dark:text-gray-500">
              ≈ {p.display_price.toFixed(2)} {p.display_currency}
            </span>
          ) : null}
        </div>
      ),
    },
    { key: 'stock', header: t('products.stock'), render: (p) => p.stock },
    {
      key: 'active',
      header: t('common.active'),
      render: (p) => (
        <button type="button" onClick={() => { updateProduct.mutate({ productId: p.id, is_active: !p.is_active }) }}>
          <Badge variant={p.is_active ? 'success' : 'neutral'}>{p.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (p) => (
        <div className="flex items-center gap-3">
          <Link to={`/products/${p.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400">
            <Pencil className="size-3.5" aria-hidden="true" /> {t('common.edit')}
          </Link>
          <button
            type="button"
            onClick={() => { if (window.confirm(t('products.confirmDelete'))) deleteProduct.mutate(p.id) }}
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
        title={t('products.title')}
        actions={
          <Link to="/products/new">
            <Button size="sm">
              <Plus className="size-4" aria-hidden="true" /> {t('products.addProduct')}
            </Button>
          </Link>
        }
      />

      {products.isLoading ? (
        <LoadingState />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data && products.data.length === 0 ? (
        <EmptyState message={t('products.empty')} />
      ) : (
        <DataTable columns={columns} rows={products.data ?? []} rowKey={(p) => p.id} />
      )}
      {(updateProduct.isError || deleteProduct.isError) ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {toApiError(updateProduct.error ?? deleteProduct.error).user_message}
        </p>
      ) : null}
    </div>
  )
}
