export type LastRowAlignment = 'start' | 'center' | 'end'

export function normalizeLastRowAlignment(value: unknown): LastRowAlignment {
  const v = String(value || 'start').toLowerCase()
  if (v === 'center' || v === 'end') return v
  return 'start'
}

/** Compact tech/marker chips under a features-grid card (`markers` or `tags`). */
export function parseFeatureMarkers(item: Record<string, unknown> | null | undefined): string[] {
  if (!item) return []
  const raw = item.markers ?? item.tags
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
  }
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s
    .split(/[·•|,;/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * 1-based grid-column start for an item when using an N-column CSS grid
 * and centering/ending an incomplete last row.
 * Returns undefined when placement should stay auto (full rows / start align).
 */
export function lastRowGridColumnStart(
  index: number,
  total: number,
  columns: number,
  align: LastRowAlignment,
): number | undefined {
  const cols = Math.max(1, Math.floor(columns))
  if (align === 'start' || total <= 0 || cols <= 1) return undefined
  const remainder = total % cols
  if (remainder === 0) return undefined
  const firstLast = total - remainder
  if (index < firstLast) return undefined
  const pos = index - firstLast
  const offset = align === 'end' ? cols - remainder : Math.round((cols - remainder) / 2)
  return offset + pos + 1
}
