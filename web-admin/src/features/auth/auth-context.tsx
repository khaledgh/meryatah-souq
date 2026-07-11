import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiClient, refreshSession } from '../../lib/api-client'
import { clearSession, setAccessToken, setRefreshToken } from '../../lib/auth-storage'
import { authResponseSchema, authUserSchema, type AuthUser } from '../../schemas/auth'

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
  //
  // Goes through refreshSession() rather than posting directly: the refresh
  // token is single-use, and the page's first data queries 401 and trigger
  // their own refresh at this exact moment. Two refreshes spending the same
  // token look like theft to the backend, which revokes EVERY session —
  // silently logging the admin out. refreshSession() holds the one mutex
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
        if (!parsed.success || parsed.data.role !== 'super_admin') {
          clearSession()
          return
        }
        setUser(parsed.data)
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- same async-cancellation flag as above.
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
