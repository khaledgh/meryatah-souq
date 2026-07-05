import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Select, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { EmptyState, ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { Coupon } from '../../schemas/coupon'
import { useVendor } from '../auth/auth-context'
import { useCoupons, useCreateCoupon, useSetCouponActive } from './use-coupons'

// Blueprint §11.B10: Coupons (vendor) — list/editor scoped to the vendor;
// CRUD; vendor-scoped codes. Editing an existing coupon's fields (other than
// active) is deferred: the backend exposes create + toggle-active for
// vendors, no PATCH. max_redemptions is enforced server-side.
export function CouponsPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const coupons = useCoupons(vendor.id)
  const createCoupon = useCreateCoupon(vendor.id)
  const setActive = useSetCouponActive(vendor.id)

  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_val: 0,
    max_redemptions: '',
    expires_at: '',
  })

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    createCoupon.mutate(
      {
        code: form.code,
        discount_type: form.discount_type,
        discount_val: form.discount_val,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : undefined,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      },
      { onSuccess: () => { setForm({ code: '', discount_type: 'percent', discount_val: 0, max_redemptions: '', expires_at: '' }) } },
    )
  }

  const columns: Column<Coupon>[] = [
    { key: 'code', header: t('coupons.code'), render: (c) => <span className="font-mono text-xs font-semibold">{c.code}</span> },
    { key: 'type', header: t('coupons.type'), render: (c) => t(`coupons.types.${c.discount_type}`, { defaultValue: c.discount_type }) },
    {
      key: 'value',
      header: t('coupons.value'),
      render: (c) => (c.discount_type === 'percent' ? `${c.discount_val.toString()}%` : c.discount_val.toFixed(2)),
    },
    {
      key: 'redemptions',
      header: t('coupons.redemptions'),
      render: (c) => (c.max_redemptions != null ? `${c.redeemed_count.toString()} / ${c.max_redemptions.toString()}` : c.redeemed_count.toString()),
    },
    { key: 'expires', header: t('coupons.expires'), render: (c) => (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : t('coupons.never')) },
    {
      key: 'status',
      header: t('common.active'),
      render: (c) => (
        <button type="button" onClick={() => { setActive.mutate({ couponId: c.id, active: !c.is_active }) }}>
          <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title={t('coupons.title')} description={t('coupons.description')} />

      {coupons.isLoading ? (
        <LoadingState />
      ) : coupons.isError ? (
        <ErrorState error={coupons.error} onRetry={() => void coupons.refetch()} />
      ) : coupons.data && coupons.data.length === 0 ? (
        <EmptyState message={t('coupons.empty')} />
      ) : (
        <DataTable columns={columns} rows={coupons.data ?? []} rowKey={(c) => c.id} />
      )}
      {setActive.isError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(setActive.error).user_message}</p>
      ) : null}

      <Card className="mt-6">
        <CardHeader title={t('coupons.createTitle')} />
        <CardBody>
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-4">
            <div className="w-32">
              <TextInput label={t('coupons.code')} required value={form.code} onChange={(e) => { setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })) }} />
            </div>
            <div className="w-32">
              <Select label={t('coupons.type')} value={form.discount_type} onChange={(e) => { setForm((f) => ({ ...f, discount_type: e.target.value })) }}>
                <option value="percent">{t('coupons.types.percent')}</option>
                <option value="fixed">{t('coupons.types.fixed')}</option>
              </Select>
            </div>
            <div className="w-24">
              <TextInput type="number" step="any" min={0} label={t('coupons.value')} required value={form.discount_val} onChange={(e) => { setForm((f) => ({ ...f, discount_val: Number(e.target.value) })) }} />
            </div>
            <div className="w-32">
              <TextInput type="number" min={0} label={t('coupons.maxRedemptions')} value={form.max_redemptions} onChange={(e) => { setForm((f) => ({ ...f, max_redemptions: e.target.value })) }} />
            </div>
            <div className="w-40">
              <TextInput type="date" label={t('coupons.expires')} value={form.expires_at} onChange={(e) => { setForm((f) => ({ ...f, expires_at: e.target.value })) }} />
            </div>
            <Button type="submit" isLoading={createCoupon.isPending}>{t('common.create')}</Button>
          </form>
          {createCoupon.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createCoupon.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
