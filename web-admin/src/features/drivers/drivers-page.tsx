import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Card, CardBody, CardHeader } from '../../components/ui/card'
import { TextInput } from '../../components/ui/input'
import { toApiError } from '../../lib/api-client'
import { AdminUserList } from '../users/admin-user-list'
import { useCreateDriver } from '../users/use-admin-users'

// Blueprint §11.A6: Drivers — list (name, phone, status, active),
// create/activate/deactivate, reset lockout. Document upload/verification
// and live location are deferred: no backend endpoint exists yet for driver
// documents or a single-driver detail view with active-order location.
export function DriversPage() {
  const { t } = useTranslation()
  const createDriver = useCreateDriver()

  const [form, setForm] = useState({ phone: '', first_name: '', last_name: '' })

  return (
    <div>
      <AdminUserList role="driver" title={t('nav.drivers')} />

      <Card className="mt-6 max-w-3xl">
        <CardHeader title={t('drivers.createTitle')} description={t('drivers.createHint')} />
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createDriver.mutate(form, {
                onSuccess: () => { setForm({ phone: '', first_name: '', last_name: '' }) },
              })
            }}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="w-44">
              <TextInput
                label={t('auth.phoneLabel')}
                required
                placeholder="+961…"
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })) }}
              />
            </div>
            <div className="w-40">
              <TextInput
                label={t('drivers.firstName')}
                required
                value={form.first_name}
                onChange={(e) => { setForm((f) => ({ ...f, first_name: e.target.value })) }}
              />
            </div>
            <div className="w-40">
              <TextInput
                label={t('drivers.lastName')}
                required
                value={form.last_name}
                onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })) }}
              />
            </div>
            <Button type="submit" isLoading={createDriver.isPending}>
              {t('drivers.create')}
            </Button>
          </form>
          {createDriver.isError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{toApiError(createDriver.error).user_message}</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}
