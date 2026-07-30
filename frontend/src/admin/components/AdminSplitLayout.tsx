import { type ReactNode } from 'react'
import { PageContext } from '@/admin/components/PageContext'
import { getContext } from '@/admin/context/registry'
import { AdminPageHero, type AdminAccent } from '@/admin/components/AdminPageHero'

type Props = {
  title: string
  contextKey: string
  slug?: string | null
  status?: string | null
  actions?: ReactNode
  form: ReactNode
  accent?: AdminAccent
  eyebrow?: string
  /**
   * Preview is no longer rendered. The admin now ships a full page builder
   * (Elementor-style) for visual editing, so the in-page live preview was
   * removed to avoid a misleading non-1:1 snapshot. Kept in the type for
   * backward compatibility with existing call sites.
   */
  preview?: ReactNode
  /** Ignored (kept for backward compatibility). */
  withPreview?: boolean
}

/**
 * AdminSplitLayout — full-width admin page chrome.
 *
 * Hero (title + context + actions) then form content spanning the entire
 * main column beside the sidebar (no artificial max-width).
 */
export function AdminSplitLayout({
  title,
  contextKey,
  slug,
  status,
  actions,
  form,
  accent = 'teal',
  eyebrow = 'Раздел',
}: Props) {
  const ctx = getContext(contextKey)

  return (
    <div className="w-full min-w-0">
      <AdminPageHero
        title={title}
        hint={ctx.where}
        eyebrow={eyebrow}
        accent={accent}
        actions={actions}
      >
        <PageContext contextKey={contextKey} slug={slug} status={status} />
      </AdminPageHero>

      {form}
    </div>
  )
}

/** Shared form grid: fills wide admin main, denser on xl+. */
export const adminFormGridClass = 'grid gap-5 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3'

/** Span all columns for long fields (content, gallery, etc.). */
export const adminFormFullClass = 'md:col-span-2 xl:col-span-3'
