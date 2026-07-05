import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient } from '../../lib/api-client'
import { clearSession, getRefreshToken, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'
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
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        if (!cancelled) setIsRestoring(false)
        return
      }
      try {
        const response = await apiClient.post<unknown>('/auth/refresh', { refresh_token: refreshToken })
        const parsed = authResponseSchema.parse(response.data)
        if (cancelled) return
        if (parsed.user.role !== 'vendor') {
          clearSession()
        } else {
          setAccessToken(parsed.access_token)
          setRefreshToken(parsed.refresh_token)
          const meResponse = await apiClient.get<unknown>('/vendor/me')
          if (cancelled) return
          setVendorState(vendorDetailSchema.parse(meResponse.data).data)
          setUser(parsed.user)
        }
      } catch {
        clearSession()
      } finally {
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

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    const parsed = verifyOtpResponseSchema.parse(response.data)

    // A brand-new phone has no vendor account — approval creates the account,
    // so "register_required" here means this phone isn't an approved vendor.
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
      setVendor,
      logout,
    }),
    [user, vendor, isRestoring, requestOtp, verifyOtp, setVendor, logout],
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
