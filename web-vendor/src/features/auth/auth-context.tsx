import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient, refreshSession } from '../../lib/api-client'
import { clearSession, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authUserSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'
import { vendorDetailSchema, type Vendor } from '../../schemas/vendor'

interface AuthContextValue {
  user: AuthUser | null
  vendor: Vendor | null
  isAuthenticated: boolean
  // True during the initial refresh-token session restore on page load, so
  // ProtectedRoute waits instead of bouncing to /login on a hard refresh.
  isRestoring: boolean
  requestOtp: (phone: string) => Promise<void>
  // verifyOtp resolves to true when a vendor session was established, or
  // throws with a user-facing message otherwise (wrong role, no account).
  verifyOtp: (phone: string, code: string) => Promise<void>
  // loginWithPassword establishes a vendor session via phone+password (used
  // when the admin sets the vendor login method to "password"). Throws with a
  // stable code on wrong-role / no-vendor-account, same as verifyOtp.
  loginWithPassword: (phone: string, password: string) => Promise<void>
  setVendor: (vendor: Vendor) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [vendor, setVendorState] = useState<Vendor | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)

  // Restore the session from the persisted refresh token on load: the access
  // token is memory-only (§5.1), so without this a hard refresh always lands
  // on /login. Refresh → re-fetch /vendor/me to rebuild the full session.
  // Goes through refreshSession() rather than posting directly: the refresh
  // token is single-use, and the page's first data queries 401 and trigger
  // their own refresh at this exact moment. Two refreshes spending the same
  // token look like theft to the backend, which revokes EVERY session —
  // silently logging the vendor out. refreshSession() holds the one mutex
  // that prevents that.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const refreshed = await refreshSession()
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `cancelled` is set by the cleanup fn after this await; not statically visible.
        if (cancelled) return
        if (!refreshed) return

        const parsed = authUserSchema.safeParse(refreshed.user)
        if (!parsed.success || parsed.data.role !== 'vendor') {
          clearSession()
          return
        }

        const meResponse = await apiClient.get<unknown>('/vendor/me')
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- same async-cancellation flag as above.
        if (cancelled) return
        setVendorState(vendorDetailSchema.parse(meResponse.data).data)
        setUser(parsed.data)
      } catch {
        clearSession()
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- same async-cancellation flag as above.
        if (!cancelled) setIsRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const requestOtp = useCallback(async (phone: string) => {
    await apiClient.post('/auth/request-otp', { phone })
  }, [])

  // establishSession validates a login response, stores tokens, resolves the
  // vendor, and sets user state. Shared by OTP and password login. Throws a
  // stable code ('no-vendor-account' | 'wrong-role') the login page localizes.
  const establishSession = useCallback(async (data: unknown) => {
    const parsed = verifyOtpResponseSchema.parse(data)

    // A brand-new phone has no vendor account — approval creates the account,
    // so a non-login status here means this phone isn't an approved vendor.
    if (parsed.status !== 'login' || !parsed.access_token || !parsed.refresh_token || !parsed.user) {
      throw new Error('no-vendor-account')
    }
    if (parsed.user.role !== 'vendor') {
      throw new Error('wrong-role')
    }

    setAccessToken(parsed.access_token)
    setRefreshToken(parsed.refresh_token)

    // Resolve which vendor this owner runs. If they have no vendor row yet
    // (e.g. account exists but approval didn't complete), treat as no-account.
    try {
      const meResponse = await apiClient.get<unknown>('/vendor/me')
      const me = vendorDetailSchema.parse(meResponse.data).data
      setVendorState(me)
    } catch {
      clearSession()
      throw new Error('no-vendor-account')
    }

    setUser(parsed.user)
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    await establishSession(response.data)
  }, [establishSession])

  const loginWithPassword = useCallback(async (phone: string, password: string) => {
    const response = await apiClient.post<unknown>('/auth/login-password', { phone, password })
    await establishSession(response.data)
  }, [establishSession])

  const setVendor = useCallback((next: Vendor) => {
    setVendorState(next)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setVendorState(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      vendor,
      isAuthenticated: user !== null && vendor !== null,
      isRestoring,
      requestOtp,
      verifyOtp,
      loginWithPassword,
      setVendor,
      logout,
    }),
    [user, vendor, isRestoring, requestOtp, verifyOtp, loginWithPassword, setVendor, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

// useVendor is a convenience for pages that require an established vendor
// session — it narrows away the null case (ProtectedRoute guarantees it).
export function useVendor(): Vendor {
  const { vendor } = useAuth()
  if (!vendor) {
    throw new Error('useVendor requires an authenticated vendor session')
  }
  return vendor
}
