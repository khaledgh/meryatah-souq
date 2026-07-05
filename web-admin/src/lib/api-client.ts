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

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post<{
      access_token: string
      refresh_token: string
    }>(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
    const { access_token, refresh_token } = response.data
    setAccessToken(access_token)
    setRefreshToken(refresh_token)
    return access_token
  } catch {
    clearSession()
    return null
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      // De-duplicate concurrent 401s into a single refresh call, not one
      // per failed request.
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const newToken = await refreshPromise
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return apiClient(original)
      }
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)
