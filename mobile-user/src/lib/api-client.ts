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

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post<{ access_token: string; refresh_token: string }>(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
    )
    const { access_token, refresh_token } = response.data
    setAccessToken(access_token)
    await setRefreshToken(refresh_token)
    return access_token
  } catch {
    await clearSession()
    return null
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const newToken = await refreshPromise
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return apiClient(original)
      }
    }
    return Promise.reject(error)
  },
)
