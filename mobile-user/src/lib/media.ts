// Resolves an image/media URL for display in <Image source={{ uri }}>.
//
// The backend normally returns image_url / logo_url / url as an absolute URL
// (built from its own MEDIA_BASE_URL), which is returned unchanged. Only when
// the backend returns a RELATIVE path (e.g. "/media/banner-ads/x.png") is
// EXPO_PUBLIC_MEDIA_BASE_URL prepended so the app can point at a media host.
//
// EXPO_PUBLIC_MEDIA_BASE_URL must be the ORIGIN only — the backend's relative
// path already contains the "/media" route segment, so we strip a trailing
// "/media" (and slashes) from the configured base to avoid a doubled
// "/media/media/..." URL. If neither is set, the relative path is returned
// as-is.
const MEDIA_BASE_URL = (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/media$/, '')
  .replace(/\/+$/, '')

export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  // Already absolute (http/https or protocol-relative) → use as-is.
  if (/^(https?:)?\/\//.test(url)) return url
  if (!MEDIA_BASE_URL) return url
  // url is a root-relative path like "/media/banner-ads/x.png" — join it to
  // the origin, preserving its own leading slash so "/media" is kept once.
  return `${MEDIA_BASE_URL}/${url.replace(/^\/+/, '')}`
}
