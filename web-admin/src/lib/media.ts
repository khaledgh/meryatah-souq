// Resolves an image/media URL for display.
//
// The backend normally returns image_url as an absolute URL (built from its
// own MEDIA_BASE_URL). This helper is backwards-compatible with that: an
// absolute URL is returned unchanged. Only when the backend returns a
// RELATIVE path (e.g. "/media/banner-ads/x.png") is VITE_MEDIA_BASE_URL
// prepended, so operators can point the client at a media host/CDN without a
// backend change. If neither is set, the relative path is returned as-is.
const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL ?? '').replace(/\/+$/, '')

export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  // Already absolute (http/https or protocol-relative) → use as-is.
  if (/^(https?:)?\/\//.test(url)) return url
  if (!MEDIA_BASE_URL) return url
  return `${MEDIA_BASE_URL}/${url.replace(/^\/+/, '')}`
}
