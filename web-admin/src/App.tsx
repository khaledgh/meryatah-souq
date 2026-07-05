import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/app-shell'
import { ErrorBoundary } from './components/error-boundary'
import { ProtectedRoute } from './components/protected-route'
import { AuthProvider } from './features/auth/auth-context'
import { LoginPage } from './features/auth/login-page'
import { useLocaleBootstrap } from './i18n/use-locale-bootstrap'
import { AuditLogPage } from './features/audit-log/audit-log-page'
import { BannerAdsPage } from './features/banner-ads/banner-ads-page'
import { CouponsPage } from './features/coupons/coupons-page'
import { CurrenciesPage } from './features/currencies/currencies-page'
import { DriversPage } from './features/drivers/drivers-page'
import { LocalizationPage } from './features/localization/localization-page'
import { OrdersPage } from './features/orders/orders-page'
import { OverviewPage } from './features/overview/overview-page'
import { PushBroadcastPage } from './features/push-broadcast/push-broadcast-page'
import { SettingsPage } from './features/settings/settings-page'
import { UsersPage } from './features/users/users-page'
import { VendorApplicationsPage } from './features/vendor-applications/vendor-applications-page'
import { VendorDetailPage } from './features/vendors/vendor-detail-page'
import { VendorsPage } from './features/vendors/vendors-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

// LocaleBootstrap runs the backend-i18n fetch/merge + direction side effect
// (see useLocaleBootstrap) for the whole app, including the login page.
// It's a child of QueryClientProvider so it has the API/i18n context.
function LocaleBootstrap({ children }: { children: ReactNode }) {
  useLocaleBootstrap()
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LocaleBootstrap>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route index element={<OverviewPage />} />
                    <Route path="vendors" element={<VendorsPage />} />
                    <Route path="vendors/:vendorId" element={<VendorDetailPage />} />
                    <Route path="vendor-applications" element={<VendorApplicationsPage />} />
                    <Route path="drivers" element={<DriversPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="banner-ads" element={<BannerAdsPage />} />
                    <Route path="coupons" element={<CouponsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="currencies" element={<CurrenciesPage />} />
                    <Route path="localization" element={<LocalizationPage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="push-broadcast" element={<PushBroadcastPage />} />
                    <Route path="audit-log" element={<AuditLogPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LocaleBootstrap>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
