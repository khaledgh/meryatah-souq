import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox, TextInput } from '../../components/ui/input'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { useGrantScheduling, useSetVendorCommission, useVendor } from './use-vendors'

// Blueprint §11.A4: Vendor — Detail/Edit. Profile, commission override,
// feature toggles, scheduling_allowed grant, ads eligibility. This
// implementation covers read-only profile display, commission override,
// and the scheduling grant — profile editing, feature toggles (JSONB),
// and ads eligibility are deferred: admin has no PATCH-profile endpoint of
// its own yet (only the vendor-owner-scoped /vendor/:id/profile route
// exists), and vendors.features has no dedicated editing route.
export function VendorDetailPage() {
  const { t } = useTranslation()
  const { vendorId } = useParams<{ vendorId: string }>()
  const { data: vendor, isLoading, isError, error, refetch } = useVendor(vendorId)
  const setCommission = useSetVendorCommission()
  const grantScheduling = useGrantScheduling()
  const [commissionInput, setCommissionInput] = useState('')

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!vendor) return null

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={vendor.category}
        actions={<Badge variant={vendor.is_active ? 'success' : 'neutral'}>{vendor.is_active ? t('common.active') : t('common.inactive')}</Badge>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('vendors.profile')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">{t('common.category')}</dt>
              <dd className="text-gray-800 dark:text-gray-200">{vendor.category}</dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('vendors.timezone')}</dt>
              <dd className="text-gray-800 dark:text-gray-200">{vendor.timezone}</dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('vendors.address')}</dt>
              <dd className="text-gray-800 dark:text-gray-200">{vendor.address ?? '—'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('vendors.displayCurrency')}</dt>
              <dd className="text-gray-800 dark:text-gray-200">{vendor.display_currency ?? '—'}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('vendors.commissionOverride')} description={t('vendors.commissionOverrideHint')} />
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const parsed = commissionInput === '' ? null : Number(commissionInput)
                setCommission.mutate({ vendorId: vendor.id, commissionPct: parsed })
              }}
              className="flex items-end gap-3"
            >
              <div className="w-40">
                <TextInput
                  id="commission_pct"
                  type="number"
                  step="0.01"
                  label={t('vendors.commissionPct')}
                  defaultValue={vendor.commission_pct ?? ''}
                  onChange={(e) => {
                    setCommissionInput(e.target.value)
                  }}
                  placeholder={t('vendors.appDefault')}
                />
              </div>
              <Button type="submit" isLoading={setCommission.isPending}>
                {t('common.save')}
              </Button>
            </form>
            {setCommission.isError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(setCommission.error).user_message}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('vendors.scheduling')} />
          <CardBody>
            <Checkbox
              id="scheduling_allowed"
              label={t('vendors.schedulingAllowedLabel')}
              checked={vendor.scheduling_allowed}
              onChange={(e) => {
                grantScheduling.mutate({ vendorId: vendor.id, allowed: e.target.checked })
              }}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
              {t('vendors.schedulingEnabledHint', { value: vendor.scheduling_enabled ? t('common.yes') : t('common.no') })}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
