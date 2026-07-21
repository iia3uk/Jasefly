import { type ButtonHTMLAttributes, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { mediaUrl } from '@/lib/api'
import { sanitizeHtml } from '@/shared/sanitize'
import type { MediaAsset } from '@/types'

/** Layout primitives */
export const Container = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />
)

export const Section = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <section className={cn('py-14 sm:py-20 lg:py-28', className)} {...props} />
)

export const Grid = ({ className, cols = 2, ...props }: HTMLAttributes<HTMLDivElement> & { cols?: 1 | 2 | 3 | 4 }) => (
  <div
    className={cn(
      'grid gap-6',
      cols === 1 && 'grid-cols-1',
      cols === 2 && 'md:grid-cols-2',
      cols === 3 && 'md:grid-cols-3',
      cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
      className,
    )}
    {...props}
  />
)

/** Actions */
export const Button = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={cn('button', className)} {...props} />
)

export const GhostButton = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={cn('button button-ghost', className)} {...props} />
)

/** Surfaces */
export const GlassPanel = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('glass rounded-[var(--radius)]', className)} {...props} />
)

/** Soft surface used across marketing pages (About/Skills language) */
export const SurfacePanel = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'relative overflow-hidden rounded-[calc(var(--radius)+4px)] border border-white/[0.06] bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]',
      className,
    )}
    {...props}
  >
    <div
      className="pointer-events-none absolute inset-0 opacity-80"
      style={{
        background:
          'radial-gradient(700px 320px at 0% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), radial-gradient(500px 280px at 100% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%)',
      }}
      aria-hidden
    />
    <div className="relative">{children}</div>
  </div>
)

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-[var(--radius)] border border-white/[0.08] bg-white/[0.03] p-6', className)} {...props} />
)

/** Feedback */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
)

export const EmptyState = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('py-20 text-center text-[var(--muted)]', className)}>{children}</div>
)

/** Content */
export const RichText = ({ html, className }: { html?: string | null; className?: string }) =>
  html ? <div className={cn('prose', className)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} /> : null

export const MediaImage = ({
  media,
  alt = '',
  className,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { media?: MediaAsset | { id?: string | number; media_id?: string | number } | string | number | null }) => {
  const src = mediaUrl(media as any)
  if (!src) return <div className={cn('animate-pulse bg-white/5', className)} />
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" {...props} />
}

export const SectionHeading = ({
  title,
  subtitle,
  action,
}: {
  title?: string | null
  subtitle?: string | null
  action?: ReactNode
}) => (
  <div className="mb-8 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-2xl">
      {title && (
        <h2 className="font-heading text-[1.75rem] font-semibold tracking-[-0.04em] sm:text-3xl lg:text-4xl">{title}</h2>
      )}
      {subtitle && <p className="mt-3 text-[0.95rem] leading-7 text-[var(--muted)] sm:text-base lg:text-lg">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
)

export const Timeline = ({
  items,
}: {
  items: Array<{ id?: string | number; title: string; subtitle?: string; meta?: string; body?: ReactNode }>
}) => (
  <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
    {items.map((item, i) => (
      <div key={item.id ?? i} className="grid gap-3 py-8 sm:grid-cols-[7.5rem_1fr] sm:gap-8 md:gap-10">
        {item.meta && <p className="text-sm tabular-nums text-[var(--muted)]">{item.meta}</p>}
        <div>
          <h3 className="font-heading text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{item.title}</h3>
          {item.subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{item.subtitle}</p>}
          {item.body && <div className="mt-3">{item.body}</div>}
        </div>
      </div>
    ))}
  </div>
)

export const Field = ({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) => (
  <label className={cn('block space-y-2 text-sm text-[var(--muted)]', className)}>
    <span>{label}</span>
    {children}
  </label>
)

export const Modal = ({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[var(--radius)] border border-white/10 bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
