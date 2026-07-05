import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient } from '../../lib/api-client'
import { clearSession, getGuestMode, setAccessToken, setGuestMode, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, verifyOtpResponseSchema, type AuthUser } from '../../schemas/auth'

// The result of verifying an OTP: either the user is now logged in, or the
// phone is new and registration must be completed with verificationToken.
type VerifyResult =
  | { kind: 'login' }
  | { kind: 'register_required'; verificationToken: string }

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

  useEffect(() => {
    void getGuestMode().then((guest) => {
      setIsGuest(guest)
      setIsInitializing(false)
    })
  }, [])

  const requestOtp = useCallback(async (phone: string) => {
    await apiClient.post('/auth/request-otp', { phone })
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string): Promise<VerifyResult> => {
    const response = await apiClient.post<unknown>('/auth/verify-otp', { phone, code })
    const parsed = verifyOtpResponseSchema.parse(response.data)

    if (parsed.status === 'login' && parsed.access_token && parsed.refresh_token && parsed.user) {
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
