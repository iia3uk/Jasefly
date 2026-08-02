import { getAdminBase, stripAdminBase } from '@/admin/adminBasePath'

/** Nav item modes for demo sandbox (from bootstrap / defaults). */
export type DemoNavMode = 'interactive' | 'preview' | 'hidden'

/**
 * Full demo admin: almost everything is visible.
 * - interactive — overlay CRUD (pages / builder / blog / media)
 * - preview — real screens + synthetic/empty API (writes denied server-side)
 * - hidden — only ops that must not appear (none by default; reserved)
 */
export const DEFAULT_DEMO_NAV_MODES: Record<string, DemoNavMode> = {
  '': 'interactive',
  dashboard: 'interactive',
  pages: 'interactive',
  blog: 'interactive',
  media: 'interactive',
  posts: 'interactive',
  // Remaining segments → preview via demoModeForPath default
}

/** First meaningful admin segment: `/admin/pages` → `pages`, `/pages` → `pages`. */
export function demoSegment(path: string): string {
  const base = getAdminBase()
  let p = String(path || '').trim()
  if (!p) return ''
  if (p.startsWith('/')) {
    p = stripAdminBase(p).replace(/^\//, '')
  } else if (p.startsWith(`${base}/`)) {
    p = p.slice(base.length + 1)
  } else if (p === base) {
    p = ''
  }
  return p.split('/').filter(Boolean)[0] || ''
}

export function demoModeForPath(path: string, modes?: Record<string, DemoNavMode>): DemoNavMode {
  const map = modes ?? DEFAULT_DEMO_NAV_MODES
  const seg = demoSegment(path)
  if (map[seg]) return map[seg]
  if (map[path]) return map[path]
  // Full demo shell: unknown sections still open as preview (API fail-closed).
  return 'preview'
}

export const DEMO_NOTICE = 'Demo data. Production secrets and destructive actions are unavailable.'
