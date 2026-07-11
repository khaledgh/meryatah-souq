// Resolves an image/media URL for display.
//
// The backend normally returns image_url as an absolute URL (built from its
// own MEDIA_BASE_URL). This helper is backwards-compatible with that: an
// absolute URL is returned unchanged. Only when the backend returns a
// RELATIVE path (e.g. "/media/products/x.png") is VITE_MEDIA_BASE_URL
// prepended so the app can point at a media host without a backend change.
//
// VITE_MEDIA_BASE_URL must be the ORIGIN only — the backend's relative path
// already contains the "/media" route segment, so we strip a trailing
// "/media" (and slashes) from the configured base to avoid a doubled
// "/media/media/..." URL. If neither is set, the relative path is returned
// as-is (resolves against the current origin).
const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/media$/, '')
  .replace(/\/+$/, '')

export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  // Already absolute (http/https or protocol-relative) → use as-is.
  if (/^(https?:)?\/\//.test(url)) return url
  if (!MEDIA_BASE_URL) return url
  // url is a root-relative path like "/media/products/x.png" — join it to
  // the origin, preserving its own leading slash so "/media" is kept exactly
  // once.
  return `${MEDIA_BASE_URL}/${url.replace(/^\/+/, '')}`
}
