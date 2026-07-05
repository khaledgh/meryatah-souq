import { CheckCircle2, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { Checkbox, TextInput } from '../../components/ui/input'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import type { VendorHour } from '../../schemas/hours'
import { useVendor } from '../auth/auth-context'
import {
  useDeleteOverride,
  useOverrides,
  useSetWeeklyHours,
  useUpsertOverride,
  useWeeklyHours,
} from './use-store-hours'

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const
const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '17:00'

// Backend TIME columns come back as "HH:MM:SS"; <input type="time"> wants
// "HH:MM". Trim/pad at the boundary so the grid round-trips cleanly.
const toInputTime = (t: string) => t.slice(0, 5)
const toApiTime = (t: string) => (t.length === 5 ? `${t}:00` : t)

function buildInitialGrid(rows: VendorHour[]): Record<number, VendorHour> {
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]))
  const grid: Record<number, VendorHour> = {}
  for (const day of DAYS) {
    const existing = byDay.get(day)
    grid[day] = existing ?? {
      day_of_week: day,
      open_time: `${DEFAULT_OPEN}:00`,
      close_time: `${DEFAULT_CLOSE}:00`,
      is_closed: true,
    }
  }
  return grid
}

// Blueprint §11.B4: Store Hours — weekly grid (per day open/close/closed),
// date overrides/holidays; timezone-aware (the vendor's own timezone drives
// Open/Closed in the user app). Split shifts (multiple ranges per day) are
// deferred — the current backend model stores one range per day_of_week.
export function StoreHoursPage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const weekly = useWeeklyHours(vendor.id)
  const setWeekly = useSetWeeklyHours(vendor.id)

  if (weekly.isLoading) return <LoadingState />
  if (weekly.isError) return <ErrorState error={weekly.error} onRetry={() => void weekly.refetch()} />

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('hours.title')} description={t('hours.description')} />
      <div className="flex flex-col gap-6">
        <WeeklyGrid initial={weekly.data ?? []} onSave={(rows) => setWeekly.mutate(rows)} isSaving={setWeekly.isPending} saveError={setWeekly.isError ? setWeekly.error : null} saved={setWeekly.isSuccess} />
        <OverridesCard vendorId={vendor.id} />
      </div>
    </div>
  )
}

function WeeklyGrid({
  initial,
  onSave,
  isSaving,
  saveError,
  saved,
}: {
  initial: VendorHour[]
  onSave: (rows: VendorHour[]) => void
  isSaving: boolean
  saveError: unknown
  saved: boolean
}) {
  const { t } = useTranslation()
  const [grid, setGrid] = useState<Record<number, VendorHour>>(() => buildInitialGrid(initial))

  const update = (day: number, patch: Partial<VendorHour>) => {
    setGrid((g) => ({ ...g, [day]: { ...g[day], ...patch } as VendorHour }))
  }

  return (
    <Card>
      <CardHeader title={t('hours.weeklyHours')} />
      <CardBody className="flex flex-col gap-3">
        {DAYS.map((day) => {
          const row = grid[day]
          if (!row) return null
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-800">
              <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">{t(`hours.days.${day}`)}</span>
              <Checkbox
                id={`closed-${day.toString()}`}
                label={t('hours.closed')}
                checked={row.is_closed}
                onChange={(e) => { update(day, { is_closed: e.target.checked }) }}
              />
              {!row.is_closed ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={t('hours.open')}
                    value={toInputTime(row.open_time)}
                    onChange={(e) => { update(day, { open_time: toApiTime(e.target.value) }) }}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    aria-label={t('hours.close')}
                    value={toInputTime(row.close_time)}
                    onChange={(e) => { update(day, { close_time: toApiTime(e.target.value) }) }}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              ) : null}
            </div>
          )
        })}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={() => { onSave(DAYS.map((d) => grid[d]).filter((r): r is VendorHour => r !== undefined)) }} isLoading={isSaving}>
            {t('common.save')}
          </Button>
          {saved ? (
            <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" aria-hidden="true" /> {t('common.saved')}
            </span>
          ) : null}
          {saveError ? <span className="text-sm text-red-600 dark:text-red-400">{toApiError(saveError).user_message}</span> : null}
        </div>
      </CardBody>
    </Card>
  )
}

function OverridesCard({ vendorId }: { vendorId: string }) {
  const { t } = useTranslation()
  const overrides = useOverrides(vendorId)
  const upsert = useUpsertOverride(vendorId)
  const remove = useDeleteOverride(vendorId)

  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [isClosed, setIsClosed] = useState(true)

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    upsert.mutate(
      { date, is_closed: isClosed, note: note || undefined },
      { onSuccess: () => { setDate(''); setNote(''); setIsClosed(true) } },
    )
  }

  return (
    <Card>
      <CardHeader title={t('hours.overrides')} description={t('hours.overridesHint')} />
      <CardBody className="flex flex-col gap-4">
        {overrides.isLoading ? (
          <LoadingState />
        ) : overrides.isError ? (
          <ErrorState error={overrides.error} onRetry={() => void overrides.refetch()} />
        ) : overrides.data && overrides.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {overrides.data.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{o.date}</span>
                  {' — '}
                  {o.is_closed ? t('hours.closed') : `${o.open_time ?? ''}–${o.close_time ?? ''}`}
                  {o.note ? <span className="text-gray-400 dark:text-gray-500"> · {o.note}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => { remove.mutate(o.id) }}
                  className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.empty')}</p>
        )}

        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div className="w-44">
            <TextInput type="date" label={t('hours.date')} required value={date} onChange={(e) => { setDate(e.target.value) }} />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <TextInput label={t('hours.note')} value={note} onChange={(e) => { setNote(e.target.value) }} />
          </div>
          <div className="pb-2">
            <Checkbox id="override-closed" label={t('hours.markClosed')} checked={isClosed} onChange={(e) => { setIsClosed(e.target.checked) }} />
          </div>
          <Button type="submit" size="sm" isLoading={upsert.isPending}>
            {t('hours.addOverride')}
          </Button>
        </form>
        {upsert.isError ? <p className="text-sm text-red-600 dark:text-red-400">{toApiError(upsert.error).user_message}</p> : null}
      </CardBody>
    </Card>
  )
}
