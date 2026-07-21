import type { PageLayout } from '@/types'

export function parseLayout(page: { layout?: PageLayout | null; layout_json?: string | null } | null | undefined): PageLayout | null {
  if (!page) return null
  if (page.layout?.elements) return page.layout
  if (typeof page.layout_json === 'string' && page.layout_json) {
    try {
      return JSON.parse(page.layout_json) as PageLayout
    } catch {
      return null
    }
  }
  return null
}
