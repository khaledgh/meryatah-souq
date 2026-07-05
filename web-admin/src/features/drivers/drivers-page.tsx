import { useTranslation } from 'react-i18next'

import { AdminUserList } from '../users/admin-user-list'

// Blueprint §11.A6: Drivers — list (name, phone, status, active),
// create/activate/deactivate, reset lockout. The shared AdminUserList
// provides the table plus a "Create driver" modal from its header button,
// so no separate inline form is needed. Document upload/verification and
// live location are deferred: no backend endpoint exists yet for driver
// documents or a single-driver detail view with active-order location.
export function DriversPage() {
  const { t } = useTranslation()
  return <AdminUserList role="driver" title={t('nav.drivers')} />
}
