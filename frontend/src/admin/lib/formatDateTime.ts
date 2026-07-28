/** Canonical admin/activity log display zone (MSK, no DST since 2014). */
export const ADMIN_TIME_ZONE = 'Europe/Moscow'
const MSK_OFFSET = '+03:00'

/**
 * Parse API/MySQL timestamps for display in Moscow time.
 * - Naive `YYYY-MM-DD HH:mm:ss` is treated as Europe/Moscow wall clock (not UTC).
 * - ISO with Z / offset is absolute UTC then shown in Moscow.
 */
export function parseAdminDateTime(raw?: string | null): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  let d: Date
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(s)
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(s)) {
    const normalized = s.includes('T') ? s : s.replace(' ', 'T')
    const withSec = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
      ? `${normalized}:00`
      : normalized
    d = new Date(`${withSec}${MSK_OFFSET}`)
  } else {
    d = new Date(s)
  }

  return Number.isNaN(d.getTime()) ? null : d
}

export function formatMoscowDateTime(
  raw?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = parseAdminDateTime(raw)
  if (!d) return raw ? String(raw) : ''
  return d.toLocaleString('ru-RU', {
    timeZone: ADMIN_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}
