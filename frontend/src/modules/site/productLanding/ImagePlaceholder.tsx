import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'

type ImagePlaceholderProps = {
  id: string
  title: string
  description?: string
  recommendedSize: string
  aspectRatio: string
  variant?: 'default' | 'scheme' | 'hero'
  className?: string
  altHint?: string
  src?: string
  children?: ReactNode
}

export function ImagePlaceholder({
  id,
  title,
  description,
  recommendedSize,
  aspectRatio,
  variant = 'default',
  className,
  altHint,
  src,
  children,
}: ImagePlaceholderProps) {
  if (src) {
    return (
      <figure
        className={clsx(
          'image-placeholder relative min-w-0 overflow-hidden border border-white/10 bg-black/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)]',
          variant === 'hero' && 'ring-1 ring-[color:var(--primary)]/25 shadow-[0_28px_90px_color-mix(in_srgb,var(--primary)_22%,transparent)]',
          className,
        )}
        data-placeholder-id={id}
        style={{ aspectRatio, borderRadius: 'var(--radius)' } as CSSProperties}
      >
        <img
          src={src}
          alt={altHint || title}
          className="absolute inset-0 size-full object-cover object-center"
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_72%,rgba(0,0,0,0.28))]"
          aria-hidden
        />
      </figure>
    )
  }

  return (
    <div
      className={clsx(
        'image-placeholder relative flex min-w-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.03] p-5 text-center shadow-[0_20px_70px_rgba(0,0,0,0.14)]',
        variant === 'scheme' ? 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_55%)]' : '',
        className,
      )}
      data-placeholder-id={id}
      role="img"
      aria-label={altHint || title}
      style={{ aspectRatio, borderRadius: 'var(--radius)' } as CSSProperties}
    >
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-3">
        {children}
        <div>
          <p className="font-medium text-[color:var(--text)]">{title}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]">{description}</p> : null}
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--muted)]">
            Рекомендуемый размер: {recommendedSize}
          </p>
        </div>
      </div>
    </div>
  )
}
