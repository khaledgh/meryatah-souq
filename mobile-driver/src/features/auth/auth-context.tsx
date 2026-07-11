import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient } from '../../lib/api-client'
import { clearSession, getRefreshToken, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'

// The result of verifying an OTP: either the user is now logged in, is new
// (registration required), or is logged in but not a driver — the driver
// app must fail fast and clearly here rather than silently proceeding,
// since backend's requireDriver middleware would 403 every subsequent call.
type VerifyResult =
  | { kind: 'login' }
  | { kind: 'register_required'; verificationToken: string }
  | { kind: 'not_a_driver' }

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (phone: string, code: string) => Promise<VerifyResult>
  completeRegistration: (input: CompleteRegistrationInput) => Promise<void>
  logout: () => Promise<void>
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
  const [isInitializing, setIsInitializing] = useState<boolean>(true)

  // No silent-session-restore across app restarts beyond the refresh token
  // itself (access token is memory-only by design, §5.1); we just need to
  // know when startup bookkeeping is done so index.tsx can redirect.
  useEffect(() => {
    void getRefreshToken().then(() => { setIsInitializing(false) })
  }, [])

  const requestOtp = useCallback(async (phone: string) => {
    await apiClient.post('/auth/request-otp', { phone })
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string): Promise<VerifyResult> => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    const parsed = verifyOtpResponseSchema.parse(response.data)

    if (parsed.status === 'login' && parsed.access_token && parsed.refresh_token && parsed.user) {
      if (parsed.user.role !== 'driver') {
        // Do not persist any session for a non-driver account — fail fast,
        // per the driver app's "must be authenticated as a driver" rule.
        return { kind: 'not_a_driver' }
      }
      setAccessToken(parsed.access_token)
      await setRefreshToken(parsed.refresh_token)
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
    setUser(parsed.user)
  }, [])

  const logout = useCallback(async () => {
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
      completeRegistration,
      logout,
    }),
    [user, isInitializing, requestOtp, verifyOtp, completeRegistration, logout],
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
