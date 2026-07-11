import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox, TextInput } from '../../components/ui/input'
import { LocationMapPicker } from '../../components/ui/location-map-picker'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { useGrantScheduling, useSetVendorCommission, useSetVendorLocation, useVendor } from './use-vendors'

interface Coords {
  longitude: number
  latitude: number
}

// Blueprint §11.A4: Vendor — Detail/Edit. Profile, commission override,
// feature toggles, scheduling_allowed grant, ads eligibility. This
// implementation covers profile display, the map-based location editor,
// commission override, and the scheduling grant. Feature toggles (JSONB) and
// ads eligibility remain deferred — vendors.features has no editing route.
export function VendorDetailPage() {
  const { t } = useTranslation()
  const { vendorId } = useParams<{ vendorId: string }>()
  const { data: vendor, isLoading, isError, error, refetch } = useVendor(vendorId)
  const setCommission = useSetVendorCommission()
  const grantScheduling = useGrantScheduling()
  const setLocation = useSetVendorLocation()
  const [commissionInput, setCommissionInput] = useState('')
  // Coordinates the admin has dragged to but not yet saved. Null = showing
  // whatever is stored, with nothing to save.
  const [pendingCoords, setPendingCoords] = useState<Coords | null>(null)

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!vendor) return null

  const storedCoords: Coords | null =
    vendor.longitude != null && vendor.latitude != null
      ? { longitude: vendor.longitude, latitude: vendor.latitude }
      : null
  const displayCoords = pendingCoords ?? storedCoords

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
          <CardHeader title={t('vendors.location')} description={t('vendors.locationHint')} />
          <CardBody>
            <div className="flex flex-col gap-3">
              <LocationMapPicker
                longitude={pendingCoords?.longitude ?? vendor.longitude}
                latitude={pendingCoords?.latitude ?? vendor.latitude}
                onChange={setPendingCoords}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {displayCoords
                    ? `${displayCoords.latitude.toFixed(6)}, ${displayCoords.longitude.toFixed(6)}`
                    : t('vendors.noLocation')}
                </p>

                <div className="flex items-center gap-2">
                  {pendingCoords ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setPendingCoords(null) }}
                      disabled={setLocation.isPending}
                    >
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={!pendingCoords || setLocation.isPending}
                    onClick={() => {
                      if (!pendingCoords || !vendorId) return
                      setLocation.mutate(
                        { vendorId, ...pendingCoords },
                        { onSuccess: () => { setPendingCoords(null) } },
                      )
                    }}
                  >
                    {setLocation.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>

              {setLocation.isError ? (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {toApiError(setLocation.error).user_message}
                </p>
              ) : null}
            </div>
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
