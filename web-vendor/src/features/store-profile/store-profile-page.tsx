import { CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { TextInput } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { toApiError } from '../../lib/api-client'
import { useAuth, useVendor } from '../auth/auth-context'
import { useUpdateProfile } from './use-store-profile'

// The locales a store name can be authored in. Backend name_i18n is an
// open map; we edit the two first-class locales the platform ships.
const NAME_LOCALES = ['en', 'ar'] as const

// Blueprint §11.B3: Store Profile/Settings — name_i18n, category, logo,
// location, timezone, display_currency. Logo upload and map-based location
// editing are deferred to a follow-up: they need the storage upload
// pipeline and a map component respectively; this covers the text profile
// fields against the existing PATCH /vendor/:id/profile endpoint.
export function StoreProfilePage() {
  const { t } = useTranslation()
  const vendor = useVendor()
  const { setVendor } = useAuth()
  const updateProfile = useUpdateProfile()
  const [saved, setSaved] = useState(false)

  const [names, setNames] = useState<Record<string, string>>(() => ({
    en: vendor.name_i18n['en'] ?? '',
    ar: vendor.name_i18n['ar'] ?? '',
  }))
  const [category, setCategory] = useState(vendor.category)
  const [address, setAddress] = useState(vendor.address ?? '')
  const [timezone, setTimezone] = useState(vendor.timezone)
  const [displayCurrency, setDisplayCurrency] = useState(vendor.display_currency ?? '')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const name_i18n = Object.fromEntries(
      Object.entries(names).filter(([, v]) => v.trim() !== ''),
    )
    updateProfile.mutate(
      {
        vendorId: vendor.id,
        name_i18n,
        category,
        address,
        timezone,
        display_currency: displayCurrency || undefined,
      },
      {
        onSuccess: (updated) => {
          setVendor(updated)
          setSaved(true)
        },
      },
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('profile.title')}
        description={t('profile.description')}
        actions={
          <Badge variant={vendor.is_active ? 'success' : 'neutral'}>
            {vendor.is_active ? t('common.active') : t('common.inactive')}
          </Badge>
        }
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('profile.storeName')} description={t('profile.storeNameHint')} />
          <CardBody className="flex flex-col gap-4">
            {NAME_LOCALES.map((loc) => (
              <TextInput
                key={loc}
                label={t('profile.nameForLocale', { locale: loc.toUpperCase() })}
                dir={loc === 'ar' ? 'rtl' : 'ltr'}
                value={names[loc] ?? ''}
                onChange={(e) => { setNames((n) => ({ ...n, [loc]: e.target.value })) }}
              />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('profile.title')} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextInput label={t('profile.category')} value={category} onChange={(e) => { setCategory(e.target.value) }} />
            <TextInput label={t('profile.displayCurrency')} value={displayCurrency} onChange={(e) => { setDisplayCurrency(e.target.value.toUpperCase()) }} placeholder="USD" />
            <TextInput label={t('profile.timezone')} value={timezone} onChange={(e) => { setTimezone(e.target.value) }} />
            <TextInput label={t('profile.address')} value={address} onChange={(e) => { setAddress(e.target.value) }} />
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('profile.coordinates')}: {vendor.latitude?.toFixed(4) ?? '—'}, {vendor.longitude?.toFixed(4) ?? '—'}
              </p>
            </div>
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={updateProfile.isPending}>
            {t('common.save')}
          </Button>
          {saved ? (
            <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" aria-hidden="true" /> {t('common.saved')}
            </span>
          ) : null}
          {updateProfile.isError ? (
            <span className="text-sm text-red-600 dark:text-red-400">{toApiError(updateProfile.error).user_message}</span>
          ) : null}
        </div>
      </form>
    </div>
  )
}
