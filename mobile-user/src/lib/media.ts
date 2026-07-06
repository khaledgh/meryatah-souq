// Resolves an image/media URL for display in <Image source={{ uri }}>.
//
// The backend normally returns image_url / logo_url / url as an absolute URL
// (built from its own MEDIA_BASE_URL), which is returned unchanged. Only when
// the backend returns a RELATIVE path (e.g. "/media/banner-ads/x.png") is
// EXPO_PUBLIC_MEDIA_BASE_URL prepended, so the app can point at a media
// host/CDN without a backend change. If neither is set, the relative path is
// returned as-is.
const MEDIA_BASE_URL = (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '')

export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  // Already absolute (http/https or protocol-relative) → use as-is.
  if (/^(https?:)?\/\//.test(url)) return url
  if (!MEDIA_BASE_URL) return url
  return `${MEDIA_BASE_URL}/${url.replace(/^\/+/, '')}`
}
