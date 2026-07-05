import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Select, TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { Coupon } from '../../schemas/coupon'
import { useCoupons, useCreateCoupon, useSetCouponActive } from './use-coupons'

// Blueprint §11.A9: Coupons (global) — list; editor (code, type, value,
// limits, expiry, vendor optional); CRUD, activate/deactivate; enforce
// max_redemptions. Editing an existing coupon's fields (other than active)
// is deferred: the backend only exposes create/toggle-active, no PATCH.
export function CouponsPage() {
  const { t } = useTranslation()
  const { data: coupons, isLoading, isError, error, refetch } = useCoupons()
  const setActive = useSetCouponActive()
  const createCoupon = useCreateCoupon()

  const [form, setForm] = useState({
    vendor_id: '',
    code: '',
    discount_type: 'percent',
    discount_val: 0,
    max_redemptions: '',
    expires_at: '',
  })

  const columns: Column<Coupon>[] = [
    { key: 'code', header: t('coupons.code'), render: (c) => <span className="font-mono text-xs font-semibold">{c.code}</span> },
    { key: 'vendor', header: t('coupons.vendor'), render: (c) => c.vendor_id ?? t('coupons.global') },
    { key: 'type', header: t('coupons.type'), render: (c) => c.discount_type },
    { key: 'value', header: t('coupons.value'), render: (c) => c.discount_val },
    {
      key: 'redemptions',
      header: t('coupons.redemptions'),
      render: (c) =>
        c.max_redemptions != null ? `${c.redeemed_count.toString()} / ${c.max_redemptions.toString()}` : c.redeemed_count.toString(),
    },
    {
      key: 'expires',
      header: t('coupons.expires'),
      render: (c) => (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : t('coupons.never')),
    },
    {
      key: 'status',
      header: t('common.active'),
      render: (c) => (
        <button
          type="button"
          onClick={() => {
            setActive.mutate({ couponId: c.id, active: !c.is_active })
          }}
        >
          <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? t('common.active') : t('common.inactive')}</Badge>
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title={t('nav.coupons')} />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={coupons ?? []} rowKey={(c) => c.id} />
      )}

      <Card className="mt-6">
        <CardHeader title={t('coupons.createTitle')} />
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createCoupon.mutate(
                {
                  vendor_id: form.vendor_id || undefined,
                  code: form.code,
                  discount_type: form.discount_type,
                  discount_val: form.discount_val,
                  max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : undefined,
                  expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
                },
                {
                  onSuccess: () => {
                    setForm({ vendor_id: '', code: '', discount_type: 'percent', discount_val: 0, max_redemptions: '', expires_at: '' })
                  },
                },
              )
            }}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="w-32">
              <TextInput
                label={t('coupons.code')}
                required
                value={form.code}
                onChange={(e) => { setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })) }}
              />
            </div>
            <div className="w-32">
              <Select
                label={t('coupons.type')}
                value={form.discount_type}
                onChange={(e) => { setForm((f) => ({ ...f, discount_type: e.target.value })) }}
              >
                <option value="percent">{t('coupons.typePercent')}</option>
                <option value="fixed">{t('coupons.typeFixed')}</option>
              </Select>
            </div>
            <div className="w-24">
              <TextInput
                type="number"
                step="any"
                label={t('coupons.value')}
                required
                value={form.discount_val}
                onChange={(e) => { setForm((f) => ({ ...f, discount_val: Number(e.target.value) })) }}
              />
            </div>
            <div className="w-32">
              <TextInput
                type="number"
                label={t('coupons.maxRedemptions')}
                value={form.max_redemptions}
                onChange={(e) => { setForm((f) => ({ ...f, max_redemptions: e.target.value })) }}
              />
            </div>
            <div className="w-40">
              <TextInput
                type="date"
                label={t('coupons.expires')}
                value={form.expires_at}
                onChange={(e) => { setForm((f) => ({ ...f, expires_at: e.target.value })) }}
              />
            </div>
            <div className="w-40">
              <TextInput
                label={t('common.vendorIdOptional')}
                value={form.vendor_id}
                onChange={(e) => { setForm((f) => ({ ...f, vendor_id: e.target.value })) }}
              />
            </div>
            <Button type="submit" isLoading={createCoupon.isPending}>
              {t('common.create')}
            </Button>
          </form>
          {createCoupon.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createCoupon.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
