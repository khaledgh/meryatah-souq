import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/app-shell'
import { ErrorBoundary } from './components/error-boundary'
import { ProtectedRoute } from './components/protected-route'
import { AccountPage } from './features/account/account-page'
import { AuthProvider } from './features/auth/auth-context'
import { LoginPage } from './features/auth/login-page'
import { CategoriesPage } from './features/categories/categories-page'
import { CategoryRequestsPage } from './features/category-requests/category-requests-page'
import { CouponsPage } from './features/coupons/coupons-page'
import { DashboardPage } from './features/dashboard/dashboard-page'
import { EarningsPage } from './features/earnings/earnings-page'
import { OrdersPage } from './features/orders/orders-page'
import { ProductEditorPage } from './features/products/product-editor-page'
// (all §11.B routes now have real pages — no placeholder needed)
import { ProductsPage } from './features/products/products-page'
import { SchedulingPage } from './features/scheduling/scheduling-page'
import { StoreHoursPage } from './features/store-hours/store-hours-page'
import { StoreProfilePage } from './features/store-profile/store-profile-page'
import { useLocaleBootstrap } from './i18n/use-locale-bootstrap'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

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
                    <Route index element={<DashboardPage />} />
                    <Route path="profile" element={<StoreProfilePage />} />
                    <Route path="hours" element={<StoreHoursPage />} />
                    <Route path="scheduling" element={<SchedulingPage />} />
                    <Route path="categories" element={<CategoriesPage />} />
                    <Route path="category-requests" element={<CategoryRequestsPage />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="products/new" element={<ProductEditorPage />} />
                    <Route path="products/:productId" element={<ProductEditorPage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="coupons" element={<CouponsPage />} />
                    <Route path="earnings" element={<EarningsPage />} />
                    <Route path="account" element={<AccountPage />} />
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
