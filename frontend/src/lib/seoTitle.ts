/** Append site name only when the title does not already contain it. */
export function withSiteNameSuffix(title: string, siteName?: string | null): string {
  const t = title.trim()
  const sn = (siteName || '').trim()
  if (!t) return sn || t
  if (!sn) return t
  if (t.toLowerCase().includes(sn.toLowerCase())) return t
  return `${t} · ${sn}`
}
