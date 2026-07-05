import { useTranslation } from 'react-i18next'

import { AdminUserList } from './admin-user-list'

// Blueprint §11.A7: Users — list/search, activate/deactivate, reset
// lockout, no password view. Search and per-user order/locale detail are
// deferred: no backend search or single-user detail endpoint exists yet.
export function UsersPage() {
  const { t } = useTranslation()
  return <AdminUserList role="user" title={t('nav.users')} />
}
