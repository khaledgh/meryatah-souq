import {
  ClipboardCheck,
  Gauge,
  Globe2,
  LayoutDashboard,
  Layers,
  ListChecks,
  LogOut,
  Megaphone,
  ReceiptText,
  ScrollText,
  Send,
  Settings2,
  ShieldCheck,
  Ticket,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../features/auth/auth-context'
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
    items: [{ to: '/', labelKey: 'nav.overview', icon: Gauge, end: true }],
  },
  {
    labelKey: 'nav.groups.operations',
    items: [
      { to: '/vendors', labelKey: 'nav.vendors', icon: LayoutDashboard },
      { to: '/vendor-applications', labelKey: 'nav.vendorApplications', icon: ClipboardCheck },
      { to: '/store-categories', labelKey: 'nav.storeCategories', icon: Layers },
      { to: '/product-categories', labelKey: 'nav.productCategories', icon: Layers },
      { to: '/category-requests', labelKey: 'nav.categoryRequests', icon: ClipboardCheck },
      { to: '/drivers', labelKey: 'nav.drivers', icon: Truck },
      { to: '/users', labelKey: 'nav.users', icon: Users },
      { to: '/orders', labelKey: 'nav.orders', icon: ReceiptText },
    ],
  },
  {
    labelKey: 'nav.groups.marketing',
    items: [
      { to: '/banner-ads', labelKey: 'nav.bannerAds', icon: Megaphone },
      { to: '/coupons', labelKey: 'nav.coupons', icon: Ticket },
      { to: '/push-broadcast', labelKey: 'nav.pushBroadcast', icon: Send },
    ],
  },
  {
    labelKey: 'nav.groups.platform',
    items: [
      { to: '/settings', labelKey: 'nav.settings', icon: Settings2 },
      { to: '/currencies', labelKey: 'nav.currencies', icon: Wallet },
      { to: '/localization', labelKey: 'nav.localization', icon: Globe2 },
      { to: '/audit-log', labelKey: 'nav.auditLog', icon: ScrollText },
    ],
  },
]

export function AppShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="flex w-64 shrink-0 flex-col border-e border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-5 dark:border-gray-800">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-card">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{t('app.name')}</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Super Admin</p>
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
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              {(user?.phone.replace(/\D/g, '').slice(-2) ?? '?').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{user?.phone}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title={t('nav.logout')}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <ListChecks className="size-4" aria-hidden="true" />
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
