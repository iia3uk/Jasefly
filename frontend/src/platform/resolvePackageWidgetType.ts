/**
 * Resolve the registry type id for a package-registered builder widget.
 *
 * Default: `${slug}.${type}` (collision-safe for third-party packages).
 * `stableType: true`: keep bare `type` — for extracted modules that own
 * frozen public widget IDs (`widget-types.v1.json`).
 */
export function resolvePackageWidgetType(
  slug: string,
  type: string,
  stableType = false,
): string {
  const t = String(type || '').trim()
  if (!t) return `${slug}.widget`
  if (stableType) {
    if (/^[a-z][a-z0-9-]*$/.test(t)) return t
    // Reject unsafe/collision-prone ids; fall back to namespaced form.
    return t.includes('.') ? t : `${slug}.${t}`
  }
  return t.includes('.') ? t : `${slug}.${t}`
}
