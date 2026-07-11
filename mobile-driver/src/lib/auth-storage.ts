import * as SecureStore from 'expo-secure-store'

// Access token lives in memory only (blueprint §5.1) — lost on app restart
// by design; the refresh token (in the OS keychain via SecureStore, not
// AsyncStorage) silently re-establishes the session.
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

const REFRESH_TOKEN_KEY = 'meryata_driver_refresh_token'

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token)
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
  }
}

export async function clearSession(): Promise<void> {
  setAccessToken(null)
  await setRefreshToken(null)
}
