import { type ReactNode } from 'react'
import { PageContext } from '@/admin/components/PageContext'
import { getContext } from '@/admin/context/registry'

type Props = {
  title: string
  contextKey: string
  slug?: string | null
  status?: string | null
  actions?: ReactNode
  form: ReactNode
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
 * Header (title + context + actions) then form content spanning the entire
 * main column beside the sidebar (no artificial max-width).
 */
export function AdminSplitLayout({
  title,
  contextKey,
  slug,
  status,
  actions,
  form,
}: Props) {
  const ctx = getContext(contextKey)

  return (
    <div className="w-full min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{ctx.where}</p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <PageContext contextKey={contextKey} slug={slug} status={status} className="mb-6" />

      {form}
    </div>
  )
}

/** Shared form grid: fills wide admin main, denser on xl+. */
export const adminFormGridClass = 'grid gap-5 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3'

/** Span all columns for long fields (content, gallery, etc.). */
export const adminFormFullClass = 'md:col-span-2 xl:col-span-3'
