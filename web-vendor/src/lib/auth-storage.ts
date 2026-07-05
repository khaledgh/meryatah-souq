// Access token lives in memory only (blueprint §5.1: "Access token in
// memory on clients... Never store secrets in plain localStorage"). It is
// lost on a full page reload by design — the refresh token (below) is used
// to silently re-establish a session on load.
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

// The refresh token is long-lived and must survive reloads, but browser
// localStorage is readable by any script on the page (XSS risk) — the
// blueprint accepts this tradeoff for the web dashboards ("secure cookie
// or protected storage") since there is no first-party backend-for-frontend
// here to set an httpOnly cookie. Keep it isolated in one place so it's
// easy to swap for a cookie-based approach later without touching callers.
const REFRESH_TOKEN_KEY = 'meryata_vendor_refresh_token'

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function clearSession(): void {
  setAccessToken(null)
  setRefreshToken(null)
}
