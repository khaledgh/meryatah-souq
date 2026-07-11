import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import i18n from '../i18n/config'
import { apiErrorSchema, type ApiError } from '../types/api-error'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './auth-storage'

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

export const apiClient = axios.create({ baseURL: BASE_URL })

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  config.headers.set('Accept-Language', i18n.language)
  return config
})

// Normalizes any error into the backend's standardized shape so callers can
// rely on the same fields regardless of what failed.
export function toApiError(error: unknown): ApiError['error'] {
  if (axios.isAxiosError(error)) {
    const parsed = apiErrorSchema.safeParse(error.response?.data)
    if (parsed.success) {
      return parsed.data.error
    }
  }
  return {
    code: 'NETWORK_ERROR',
    status: 0,
    developer_message: error instanceof Error ? error.message : 'Unknown error',
    user_message: 'Something went wrong. Please check your connection and try again.',
  }
}

// The refresh token is single-use: the backend rotates it and revokes the old
// one, and a SECOND use of an already-revoked token is treated as theft — it
// revokes every session the user has (auth_service.go's reuse detection).
//
// So every refresh in this app MUST go through this one mutex. Two callers
// racing with the same token (e.g. the session restore on app start, and a
// screen's first request 401ing at the same moment) would otherwise look
// exactly like a stolen token and silently log the user out for good.
let refreshPromise: Promise<RefreshResult | null> | null = null

export interface RefreshResult {
  accessToken: string
  /** The full user payload /auth/refresh returns, so a caller restoring a
   *  session doesn't need a second round trip to learn who they are. */
  user: unknown
}

async function doRefresh(): Promise<RefreshResult | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post<{ access_token: string; refresh_token: string; user: unknown }>(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
    )
    const { access_token, refresh_token, user } = response.data
    setAccessToken(access_token)
    await setRefreshToken(refresh_token)
    return { accessToken: access_token, user }
  } catch {
    // Expired, revoked, or already used — the session is unrecoverable.
    await clearSession()
    return null
  }
}

// refreshSession is the ONLY way to refresh. Concurrent callers share one
// in-flight request rather than each spending the (single-use) token.
export function refreshSession(): Promise<RefreshResult | null> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    // Never try to refresh a failed refresh: /auth/refresh is called with
    // axios directly (not apiClient), so it can't recurse here, but the guard
    // documents the invariant and protects against a future caller wiring it
    // through apiClient by mistake.
    const isRefreshCall = original?.url?.includes('/auth/refresh') ?? false

    if (error.response?.status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true
      const refreshed = await refreshSession()
      if (refreshed) {
        original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
        return apiClient(original)
      }
    }
    return Promise.reject(error)
  },
)
