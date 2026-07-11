import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient, refreshSession } from '../../lib/api-client'
import { clearSession, getRefreshToken, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authUserSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'
import { stopBackgroundTracking } from '../tracking/location-task'

// The result of verifying an OTP. Both non-login outcomes are dead ends for
// this app (see app/(auth)/otp.tsx):
//   - not_a_driver      — account exists but isn't a driver; every /driver/*
//                         call would 403, so fail fast rather than proceed.
//   - register_required — no account at all. There is no driver
//                         self-registration: /auth/complete-registration
//                         hardcodes the `user` role, so it could only mint an
//                         account that can never use this app. Drivers are
//                         provisioned by an admin (blueprint §11.A6).
type VerifyResult =
  | { kind: 'login' }
  | { kind: 'register_required' }
  | { kind: 'not_a_driver' }

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (phone: string, code: string) => Promise<VerifyResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isInitializing, setIsInitializing] = useState<boolean>(true)

  // Restore the session on cold start. The access token is memory-only
  // (§5.1) and so is always gone after a restart, but the refresh token
  // persists in the OS keychain — /auth/refresh trades it for a fresh pair
  // AND returns the full user payload, so this re-establishes everything.
  // Without it the app would bounce every returning driver to the OTP screen
  // despite holding a perfectly valid credential.
  //
  // Goes through refreshSession() rather than posting directly: the refresh
  // token is single-use, and a concurrent refresh from api-client's 401
  // interceptor (a screen's first request racing this one on a deep link)
  // would look like token theft to the backend and revoke EVERY session the
  // driver has. refreshSession() holds the one mutex that prevents that.
  useEffect(() => {
    void (async () => {
      try {
        const refreshed = await refreshSession()
        if (!refreshed) return

        const parsed = authUserSchema.safeParse(refreshed.user)
        // Same guard as verifyOtp: never hold a session for a non-driver.
        if (!parsed.success || parsed.data.role !== 'driver') {
          await clearSession()
          return
        }
        setUser(parsed.data)
      } finally {
        setIsInitializing(false)
      }
    })()
  }, [])

  const requestOtp = useCallback(async (phone: string) => {
    await apiClient.post('/auth/request-otp', { phone })
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string): Promise<VerifyResult> => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    const parsed = verifyOtpResponseSchema.parse(response.data)

    if (parsed.status === 'login' && parsed.access_token && parsed.refresh_token && parsed.user) {
      if (parsed.user.role !== 'driver') {
        // Do not persist any session for a non-driver account.
        return { kind: 'not_a_driver' }
      }
      setAccessToken(parsed.access_token)
      await setRefreshToken(parsed.refresh_token)
      setUser(parsed.user)
      return { kind: 'login' }
    }
    if (parsed.status === 'register_required') {
      return { kind: 'register_required' }
    }
    throw new Error('unexpected verify-otp response')
  }, [])

  const logout = useCallback(async () => {
    // The background location task deliberately outlives the Active Order
    // screen (that's what keeps the customer's map alive while the driver has
    // the app backgrounded), so logging out is the one place that must
    // explicitly end it — otherwise it would keep reporting for a session
    // that no longer exists.
    await stopBackgroundTracking()

    // Revoke server-side first: clearing only local storage would leave the
    // refresh token valid for its full (now year-long) TTL, so a leaked copy
    // would outlive the "logout" entirely. Best-effort — a failed call must
    // still clear the local session.
    const refreshToken = await getRefreshToken()
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken })
      } catch {
        // Offline or already-invalid token — proceed with the local clear.
      }
    }
    await clearSession()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      requestOtp,
      verifyOtp,
      logout,
    }),
    [user, isInitializing, requestOtp, verifyOtp, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
