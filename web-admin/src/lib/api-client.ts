import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { LOCALE_STORAGE_KEY } from '../i18n/config'
import { apiErrorSchema, type ApiError } from '../types/api-error'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './auth-storage'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1'

export const apiClient = axios.create({ baseURL: BASE_URL })

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  const locale = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (locale) {
    config.headers.set('Accept-Language', locale)
  }
  return config
})

// Normalizes any error into the backend's standardized shape so every
// caller (TanStack Query's onError, form submit handlers) can rely on the
// same fields regardless of what actually failed. Distinguishes the failure
// classes so the UI shows an accurate, actionable message instead of always
// blaming the network — a 401 (session expired) and a client-side Zod parse
// failure both surfaced as "check your connection" before, which was
// misleading and un-diagnosable.
export function toApiError(error: unknown): ApiError['error'] {
  if (axios.isAxiosError(error)) {
    // The backend's standardized error body — the happy path.
    const parsed = apiErrorSchema.safeParse(error.response?.data)
    if (parsed.success) {
      return parsed.data.error
    }
    // An HTTP response came back but didn't match the error contract.
    const status = error.response?.status
    if (status === 401 || status === 403) {
      return {
        code: 'UNAUTHORIZED',
        status,
        developer_message: `Auth failed (${status.toString()}) on ${error.config?.url ?? 'request'}`,
        user_message: 'Your session has expired. Please sign in again.',
      }
    }
    if (status != null) {
      return {
        code: 'HTTP_ERROR',
        status,
        developer_message: `Unexpected ${status.toString()} response on ${error.config?.url ?? 'request'}`,
        user_message: 'The server returned an unexpected response. Please try again.',
      }
    }
    // No response at all → a genuine network/CORS/timeout failure.
    return {
      code: 'NETWORK_ERROR',
      status: 0,
      developer_message: error.message,
      user_message: 'Something went wrong. Please check your connection and try again.',
    }
  }
  // Non-Axios throw (most commonly a Zod parse failure in a queryFn) — this
  // is a client/contract bug, not a connectivity problem.
  return {
    code: 'CLIENT_ERROR',
    status: 0,
    developer_message: error instanceof Error ? error.message : 'Unknown error',
    user_message: 'Something went wrong while loading this page. Please try again.',
  }
}

// The refresh token is single-use: the backend rotates it and revokes the
// old one, and presenting an ALREADY-REVOKED token is treated as theft — it
// revokes every session the user has (auth_service.go's reuse detection).
//
// So every refresh in this app MUST go through this one mutex. Two callers
// racing with the same token would otherwise look exactly like a stolen
// token and log the admin out for good. That is not hypothetical: on a page
// load, the session restore in auth-context and the first data query's 401
// fire at the same moment, and before this was shared they each spent the
// same token.
let refreshPromise: Promise<RefreshResult | null> | null = null

export interface RefreshResult {
  accessToken: string
  /** The full user payload /auth/refresh returns, so a caller restoring a
   *  session doesn't need a second round trip to learn who they are. */
  user: unknown
}

async function doRefresh(): Promise<RefreshResult | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post<{
      access_token: string
      refresh_token: string
      user: unknown
    }>(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
    const { access_token, refresh_token, user } = response.data
    setAccessToken(access_token)
    setRefreshToken(refresh_token)
    return { accessToken: access_token, user }
  } catch {
    // Expired, revoked, or already used — the session is unrecoverable.
    clearSession()
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
    // Never try to refresh a failed refresh — that would spend the token a
    // second time, which is precisely what trips reuse detection.
    const isRefreshCall = original?.url?.includes('/auth/refresh') ?? false

    if (error.response?.status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true
      const refreshed = await refreshSession()
      if (refreshed) {
        original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
        return apiClient(original)
      }
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)
