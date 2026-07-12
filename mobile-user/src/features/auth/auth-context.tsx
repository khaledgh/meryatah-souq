import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { OneSignal } from 'react-native-onesignal'

import { apiClient, refreshSession } from '../../lib/api-client'
import { clearSession, getGuestMode, getRefreshToken, setAccessToken, setGuestMode, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, authUserSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'

// The result of verifying an OTP: either the user is now logged in, the
// phone is new and registration must be completed with verificationToken,
// or the phone belongs to a non-user account (e.g. a driver) — this app
// must reject that rather than silently logging them in with a role that
// every /user/* endpoint will then 403 on (blueprint §5.3: driver/vendor
// accounts are provisioned separately and don't share this login surface).
type VerifyResult =
  | { kind: 'login' }
  | { kind: 'register_required'; verificationToken: string }
  | { kind: 'not_a_user' }

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isGuest: boolean
  isInitializing: boolean
  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (phone: string, code: string) => Promise<VerifyResult>
  completeRegistration: (input: CompleteRegistrationInput) => Promise<void>
  logout: () => Promise<void>
  bypassAuth: () => Promise<void>
}

interface CompleteRegistrationInput {
  verificationToken: string
  firstName: string
  lastName: string
  password: string
  preferredLocale: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isGuest, setIsGuest] = useState<boolean>(false)
  const [isInitializing, setIsInitializing] = useState<boolean>(true)

  // Restore the session on cold start. The access token is memory-only
  // (§5.1) and so is always gone after a restart, but the refresh token
  // persists in the OS keychain — /auth/refresh trades it for a fresh pair
  // AND returns the full user payload, so this one call re-establishes
  // everything. Without it the app would bounce every returning user to the
  // OTP screen despite holding a perfectly valid credential.
  // Goes through refreshSession() rather than posting directly: the refresh
  // token is single-use, and a concurrent refresh from api-client's 401
  // interceptor (a screen's first request racing this one on a deep link)
  // would look like token theft to the backend and revoke EVERY session the
  // user has. refreshSession() holds the one mutex that prevents that.
  useEffect(() => {
    void (async () => {
      try {
        const refreshed = await refreshSession()
        if (!refreshed) {
          setIsGuest(await getGuestMode())
          return
        }
        const parsed = authUserSchema.safeParse(refreshed.user)
        if (!parsed.success || (parsed.data.role !== 'user' && parsed.data.role !== 'driver')) {
          // Same guard as verifyOtp: a vendor phone must not hold a
          // session here — every /user/* call would 403.
          await clearSession()
          setIsGuest(await getGuestMode())
          return
        }
        await setGuestMode(false)
        setIsGuest(false)
        setUser(parsed.data)
      } finally {
        setIsInitializing(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (user && process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) {
      const registerToken = (subId: string | null | undefined) => {
        if (subId) {
          apiClient.post('/push-tokens', {
            player_id: subId,
            platform: Platform.OS,
          }).catch(() => {
            // best-effort
          })
        }
      }

      OneSignal.User.pushSubscription.getIdAsync()
        .then((id) => registerToken(id))
        .catch(() => {})

      const listener = (event: { current: { id?: string | null } }) => {
        registerToken(event.current.id)
      }
      OneSignal.User.pushSubscription.addEventListener('change', listener)
      return () => {
        OneSignal.User.pushSubscription.removeEventListener('change', listener)
      }
    }
  }, [user])

  const requestOtp = useCallback(async (phone: string) => {
    await apiClient.post('/auth/request-otp', { phone })
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string): Promise<VerifyResult> => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    const parsed = verifyOtpResponseSchema.parse(response.data)

    if (parsed.status === 'login' && parsed.access_token && parsed.refresh_token && parsed.user) {
      if (parsed.user.role !== 'user' && parsed.user.role !== 'driver') {
        // Do not persist any session for a non-user/non-driver account (e.g. a
        // vendor phone reused here) — every /user/* call would 403
        // anyway, so fail fast at login instead of leaving the app in a
        // broken logged-in-but-nothing-works state.
        return { kind: 'not_a_user' }
      }
      setAccessToken(parsed.access_token)
      await setRefreshToken(parsed.refresh_token)
      await setGuestMode(false)
      setIsGuest(false)
      setUser(parsed.user)
      return { kind: 'login' }
    }
    if (parsed.status === 'register_required' && parsed.verification_token) {
      return { kind: 'register_required', verificationToken: parsed.verification_token }
    }
    throw new Error('unexpected verify-otp response')
  }, [])

  const completeRegistration = useCallback(async (input: CompleteRegistrationInput) => {
    const response = await apiClient.post<unknown>('/auth/complete-registration', {
      verification_token: input.verificationToken,
      first_name: input.firstName,
      last_name: input.lastName,
      password: input.password,
      preferred_locale: input.preferredLocale,
    })
    const parsed = authResponseSchema.parse(response.data)
    setAccessToken(parsed.access_token)
    await setRefreshToken(parsed.refresh_token)
    await setGuestMode(false)
    setIsGuest(false)
    setUser(parsed.user)
  }, [])

  const logout = useCallback(async () => {
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
    setIsGuest(false)
    setUser(null)
  }, [])

  const bypassAuth = useCallback(async () => {
    await setGuestMode(true)
    setIsGuest(true)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isGuest,
      isInitializing,
      requestOtp,
      verifyOtp,
      completeRegistration,
      logout,
      bypassAuth,
    }),
    [user, isGuest, isInitializing, requestOtp, verifyOtp, completeRegistration, logout, bypassAuth],
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
