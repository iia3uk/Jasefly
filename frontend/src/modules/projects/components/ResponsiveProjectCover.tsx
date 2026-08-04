import clsx from 'clsx'
import { mediaUrl } from '@/lib/api'
import type { Project } from '@/modules/projects/types'
import {
  mediaAssetDims,
  projectCoverSources,
  resolveProjectCoverMedia,
  type ProjectCoverVariant,
} from '@/shared/projectCover'

/**
 * Project cover that can switch portrait/landscape via prop or `<picture>` (auto).
 * Orientation assets are separate compositions — not CSS crops of default.
 */
export function ResponsiveProjectCover({
  project,
  coverVariant = 'auto',
  className,
  imgClassName,
  sizes,
  priority = false,
}: {
  project: Project
  coverVariant?: ProjectCoverVariant
  className?: string
  imgClassName?: string
  sizes?: string
  /** Eager load when the cover can land in the first viewport. */
  priority?: boolean
}) {
  const sources = projectCoverSources(project)
  const alt = sources.alt || project.title || ''
  const loading = priority ? 'eager' : 'lazy'
  // Absolute fill: card geometry owns the box; image never letterboxes via intrinsic ratio.
  const imgCls = clsx(
    'absolute inset-0 h-full w-full object-cover object-center',
    imgClassName,
  )

  if (coverVariant !== 'auto') {
    const media = resolveProjectCoverMedia(sources, coverVariant)
    const src = mediaUrl(media as never)
    if (!src) {
      return <div className={clsx('animate-pulse bg-white/5', className)} aria-hidden />
    }
    const dims = mediaAssetDims(media)
    return (
      <div className={clsx('relative min-h-0 overflow-hidden bg-black/40', className)}>
        <img
          src={src}
          alt={alt}
          width={dims.width}
          height={dims.height}
          loading={loading}
          decoding="async"
          sizes={sizes}
          className={imgCls}
        />
      </div>
    )
  }

  const portraitMedia = resolveProjectCoverMedia(sources, 'portrait')
  const landscapeMedia = resolveProjectCoverMedia(sources, 'landscape')
  const portraitSrc = mediaUrl(portraitMedia as never)
  const landscapeSrc = mediaUrl(landscapeMedia as never)
  const src = portraitSrc || landscapeSrc
  if (!src) {
    return <div className={clsx('animate-pulse bg-white/5', className)} aria-hidden />
  }

  const dims = mediaAssetDims(portraitMedia ?? landscapeMedia)
  const usePicture = Boolean(portraitSrc && landscapeSrc && portraitSrc !== landscapeSrc)

  return (
    <div className={clsx('relative min-h-0 overflow-hidden bg-black/40', className)}>
      {usePicture ? (
        <picture className="absolute inset-0 block h-full w-full">
          <source media="(max-width: 1023px)" srcSet={landscapeSrc!} />
          <img
            src={portraitSrc!}
            alt={alt}
            width={dims.width}
            height={dims.height}
            loading={loading}
            decoding="async"
            sizes={sizes}
            className={imgCls}
          />
        </picture>
      ) : (
        <img
          src={src}
          alt={alt}
          width={dims.width}
          height={dims.height}
          loading={loading}
          decoding="async"
          sizes={sizes}
          className={imgCls}
        />
      )}
    </div>
  )
}
