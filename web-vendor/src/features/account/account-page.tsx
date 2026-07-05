import { LogOut, Phone, Store, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { LanguageSwitcher } from '../../components/language-switcher'
import { PageHeader } from '../../components/ui/page-header'
import { vendorDisplayName } from '../../schemas/vendor'
import { useAuth, useVendor } from '../auth/auth-context'

// Blueprint §11.B12: Account/Language — profile, language switcher
// (Arabic/RTL), logout. Password change is deferred (vendors authenticate by
// phone+OTP, no password on the account). Locale is persisted client-side by
// the switcher and sent via Accept-Language; a backend preferred_locale
// write endpoint doesn't exist yet, so it isn't stored server-side.
export function AccountPage() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const vendor = useVendor()

  const ownerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('account.title')} description={t('account.description')} />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t('account.store')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Store className="size-3.5" aria-hidden="true" /> {t('account.storeName')}
              </dt>
              <dd className="text-gray-800 dark:text-gray-200">{vendorDisplayName(vendor, i18n.language)}</dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('account.status')}</dt>
              <dd>
                <Badge variant={vendor.is_active ? 'success' : 'neutral'}>
                  {vendor.is_active ? t('common.active') : t('common.inactive')}
                </Badge>
              </dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('account.owner')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <User className="size-3.5" aria-hidden="true" /> {t('account.name')}
              </dt>
              <dd className="text-gray-800 dark:text-gray-200">{ownerName || '—'}</dd>
              <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Phone className="size-3.5" aria-hidden="true" /> {t('account.phone')}
              </dt>
              <dd className="font-mono text-gray-800 dark:text-gray-200">{user?.phone ?? '—'}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('account.language')} description={t('account.languageHint')} />
          <CardBody>
            <LanguageSwitcher />
          </CardBody>
        </Card>

        <div>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="size-4" aria-hidden="true" /> {t('nav.logout')}
          </Button>
        </div>
      </div>
    </div>
  )
}
