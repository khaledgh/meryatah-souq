import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient } from '../../lib/api-client'
import { clearSession, getRefreshToken, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, type AuthUser } from '../../schemas/auth'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  // True during the initial refresh-token session restore on page load.
  // ProtectedRoute waits on this so a hard refresh doesn't bounce to /login
  // before the session can be re-established.
  isRestoring: boolean
  login: (phone: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)

  // On mount, try to restore the session from the persisted refresh token.
  // The access token is memory-only (§5.1) and gone after a reload, so
  // without this a hard refresh always lands on /login. /auth/refresh
  // returns the full user payload, so one call re-establishes everything.
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
        if (parsed.user.role !== 'super_admin') {
          clearSession()
        } else {
          setAccessToken(parsed.access_token)
          setRefreshToken(parsed.refresh_token)
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

  const login = useCallback(async (phone: string, password: string) => {
    const response = await apiClient.post<unknown>('/auth/login-password', { phone, password })
    const parsed = authResponseSchema.parse(response.data)
    setAccessToken(parsed.access_token)
    setRefreshToken(parsed.refresh_token)
    if (parsed.user.role !== 'super_admin') {
      clearSession()
      throw new Error('Only super_admin accounts may access this dashboard.')
    }
    setUser(parsed.user)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isRestoring, login, logout }),
    [user, isRestoring, login, logout],
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
