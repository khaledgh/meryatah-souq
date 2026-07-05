import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import type { Coupon } from '../../schemas/coupon'
import {
  useCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useSetCouponActive,
  useUpdateCoupon,
} from './use-coupons'

// An ISO instant → the value a <input type="date"> expects (YYYY-MM-DD).
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear().toString()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A date-input value → RFC3339, or undefined when empty.
function dateInputToIso(date: string): string | undefined {
  if (!date) return undefined
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

interface CouponFormState {
  vendor_id: string
  code: string
  discount_type: string
  discount_val: string
  max_redemptions: string
  starts_at: string
  expires_at: string
}

const emptyForm: CouponFormState = {
  vendor_id: '',
  code: '',
  discount_type: 'percent',
  discount_val: '',
  max_redemptions: '',
  starts_at: '',
  expires_at: '',
}

function couponToForm(c: Coupon): CouponFormState {
  return {
    vendor_id: c.vendor_id ?? '',
    code: c.code,
    discount_type: c.discount_type,
    discount_val: c.discount_val.toString(),
    max_redemptions: c.max_redemptions != null ? c.max_redemptions.toString() : '',
    starts_at: isoToDateInput(c.starts_at),
    expires_at: isoToDateInput(c.expires_at),
  }
}

// Blueprint §11.A9: Coupons (global) — list; editor (code, type, value,
// limits, start/expiry, vendor optional) in a modal opened from the header;
// create, edit, delete, activate/deactivate; enforce max_redemptions.
export function CouponsPage() {
  const { t } = useTranslation()
  const { data: coupons, isLoading, isError, error, refetch } = useCoupons()
  const setActive = useSetCouponActive()
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon()
  const deleteCoupon = useDeleteCoupon()

  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<CouponFormState>(emptyForm)

  const isEdit = editing?.id != null
  const mutation = isEdit ? updateCoupon : createCoupon

  const openCreate = () => {
    setForm(emptyForm)
    setEditing({ id: null })
  }
  const openEdit = (c: Coupon) => {
    setForm(couponToForm(c))
    setEditing({ id: c.id })
  }
  const close = () => { setEditing(null) }

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const shared = {
      code: form.code,
      discount_type: form.discount_type,
      discount_val: Number(form.discount_val),
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : undefined,
      starts_at: dateInputToIso(form.starts_at),
      expires_at: dateInputToIso(form.expires_at),
    }
    const editId = editing?.id ?? null
    if (editId != null) {
      updateCoupon.mutate({ id: editId, ...shared }, { onSuccess: close })
    } else {
      createCoupon.mutate({ vendor_id: form.vendor_id || undefined, ...shared }, { onSuccess: close })
    }
  }

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
      key: 'starts',
      header: t('coupons.starts'),
      render: (c) => (c.starts_at ? new Date(c.starts_at).toLocaleDateString() : <span className="text-gray-400 dark:text-gray-600">—</span>),
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
                deleteCoupon.mutate(c.id)
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
        title={t('nav.coupons')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t('coupons.create')}
          </Button>
        }
      />

      {isLoading ? <LoadingState /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : (
        <DataTable columns={columns} rows={coupons ?? []} rowKey={(c) => c.id} />
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={isEdit ? t('coupons.editTitle') : t('coupons.createTitle')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextInput
            label={t('coupons.code')}
            required
            value={form.code}
            onChange={(e) => { setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })) }}
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <Select
                label={t('coupons.type')}
                value={form.discount_type}
                onChange={(e) => { setForm((f) => ({ ...f, discount_type: e.target.value })) }}
              >
                <option value="percent">{t('coupons.typePercent')}</option>
                <option value="fixed">{t('coupons.typeFixed')}</option>
              </Select>
            </div>
            <div className="flex-1">
              <TextInput
                type="number"
                step="any"
                min={0}
                label={t('coupons.value')}
                required
                value={form.discount_val}
                onChange={(e) => { setForm((f) => ({ ...f, discount_val: e.target.value })) }}
              />
            </div>
          </div>
          <TextInput
            type="number"
            min={0}
            label={t('coupons.maxRedemptions')}
            value={form.max_redemptions}
            onChange={(e) => { setForm((f) => ({ ...f, max_redemptions: e.target.value })) }}
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <TextInput
                type="date"
                label={t('coupons.starts')}
                value={form.starts_at}
                onChange={(e) => { setForm((f) => ({ ...f, starts_at: e.target.value })) }}
              />
            </div>
            <div className="flex-1">
              <TextInput
                type="date"
                label={t('coupons.expires')}
                value={form.expires_at}
                onChange={(e) => { setForm((f) => ({ ...f, expires_at: e.target.value })) }}
              />
            </div>
          </div>
          {!isEdit ? (
            <TextInput
              label={t('common.vendorIdOptional')}
              value={form.vendor_id}
              onChange={(e) => { setForm((f) => ({ ...f, vendor_id: e.target.value })) }}
            />
          ) : null}

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
