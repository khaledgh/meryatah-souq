import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Package,
  Receipt,
  Settings2,
  Store,
  Ticket,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../features/auth/auth-context'
import { vendorDisplayName } from '../schemas/vendor'
import { LanguageSwitcher } from './language-switcher'

interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.groups.overview',
    items: [{ to: '/', labelKey: 'nav.dashboard', icon: LayoutGrid, end: true }],
  },
  {
    labelKey: 'nav.groups.store',
    items: [
      { to: '/profile', labelKey: 'nav.storeProfile', icon: Store },
      { to: '/hours', labelKey: 'nav.storeHours', icon: CalendarDays },
      { to: '/scheduling', labelKey: 'nav.scheduling', icon: CalendarClock },
    ],
  },
  {
    labelKey: 'nav.groups.catalog',
    items: [
      { to: '/categories', labelKey: 'nav.categories', icon: LayoutGrid },
      { to: '/products', labelKey: 'nav.products', icon: Package },
    ],
  },
  {
    labelKey: 'nav.groups.sales',
    items: [
      { to: '/orders', labelKey: 'nav.orders', icon: ClipboardList },
      { to: '/coupons', labelKey: 'nav.coupons', icon: Ticket },
      { to: '/earnings', labelKey: 'nav.earnings', icon: Receipt },
    ],
  },
  {
    labelKey: 'nav.groups.account',
    items: [{ to: '/account', labelKey: 'nav.account', icon: UserCog }],
  },
]

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { vendor, logout } = useAuth()

  const storeName = vendor ? vendorDisplayName(vendor, i18n.language) : ''

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="flex w-64 shrink-0 flex-col border-e border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-5 dark:border-gray-800">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-card">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{storeName || t('app.name')}</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('app.tagline')}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.labelKey}>
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                {t(group.labelKey)}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span className="absolute inset-y-1 start-0 w-0.5 rounded-full bg-brand-600" aria-hidden="true" />
                        ) : null}
                        <item.icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <Settings2 className="size-4" aria-hidden="true" />
            <span>{t('app.tagline')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
