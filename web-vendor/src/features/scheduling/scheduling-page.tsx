import { CalendarClock, Info, Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { useAuth, useVendor } from '../auth/auth-context'
import { useSetSchedulingEnabled } from './use-scheduling'

// Blueprint §11.B5: Scheduling Settings — the two-gate rule. Admin grants
// `scheduling_allowed`; the vendor then toggles `scheduling_enabled`, which
// only takes effect when allowed. If not allowed, the toggle is hidden with
// an explanatory note. Slot config (slot_minutes, lead_minutes, etc.) is
// read-only for now: no backend endpoint persists scheduling_config yet.
export function SchedulingPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const { setVendor } = useAuth()
  const setEnabled = useSetSchedulingEnabled(vendor.id)
  const [enabled, setEnabledLocal] = useState(vendor.scheduling_enabled)

  const onToggle = (next: boolean) => {
    setEnabledLocal(next)
    setEnabled.mutate(next, {
      onSuccess: () => { setVendor({ ...vendor, scheduling_enabled: next }) },
      onError: () => { setEnabledLocal(vendor.scheduling_enabled) },
    })
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('scheduling.title')} description={t('scheduling.description')} />

      {!vendor.scheduling_allowed ? (
        <Card>
          <CardBody className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Lock className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('scheduling.notAllowed')}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardBody className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                  <CalendarClock className="size-4" aria-hidden="true" />
                </span>
                <Checkbox
                  id="scheduling-enabled"
                  label={t('scheduling.enableToggle')}
                  checked={enabled}
                  disabled={setEnabled.isPending}
                  onChange={(e) => { onToggle(e.target.checked) }}
                />
              </div>
            </CardBody>
          </Card>
          {setEnabled.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{toApiError(setEnabled.error).user_message}</p>
          ) : null}

          <Card>
            <CardHeader title={t('scheduling.config')} />
            <CardBody>
              <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                {t('common.comingSoon')}
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
