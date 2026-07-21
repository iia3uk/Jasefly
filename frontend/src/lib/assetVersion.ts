/** Injected at build time in vite.config.ts — changes on every release. */
export const ASSET_VERSION = String(import.meta.env.VITE_ASSET_VERSION || '0')

/** Append `?v=` so public/ brand & favicon URLs bust after each deploy. */
export function withAssetVersion(url: string): string {
  if (!url) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${encodeURIComponent(ASSET_VERSION)}`
}
