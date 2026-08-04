import type { MediaAsset, Project } from '@/types'

export type ProjectCoverVariant = 'portrait' | 'landscape' | 'auto'

export type MediaReference = MediaAsset | string | number | null | undefined

/** Universal responsive cover: default + optional orientation-specific assets. */
export type ResponsiveProjectCover = {
  default: MediaReference
  portrait?: MediaReference
  landscape?: MediaReference
  alt: string
}

type CoverPick = Pick<
  Project,
  | 'title'
  | 'cover'
  | 'cover_media_id'
  | 'cover_portrait'
  | 'cover_portrait_media_id'
  | 'cover_landscape'
  | 'cover_landscape_media_id'
>

function asRef(asset: MediaReference, id: MediaReference): MediaReference {
  if (asset != null && asset !== '') return asset
  if (id != null && id !== '') return id
  return null
}

export function projectCoverSources(project: CoverPick | null | undefined): ResponsiveProjectCover {
  const alt = String(project?.title || 'Проект')
  const def = asRef(project?.cover, project?.cover_media_id)
  const portrait = asRef(project?.cover_portrait, project?.cover_portrait_media_id)
  const landscape = asRef(project?.cover_landscape, project?.cover_landscape_media_id)
  return {
    default: def,
    portrait: portrait ?? undefined,
    landscape: landscape ?? undefined,
    alt,
  }
}

/** Resolve a single media ref for a fixed variant (not viewport-auto). */
export function resolveProjectCoverMedia(
  sources: ResponsiveProjectCover,
  variant: Exclude<ProjectCoverVariant, 'auto'>,
): MediaReference {
  if (variant === 'portrait') return sources.portrait ?? sources.default
  return sources.landscape ?? sources.default
}

export function mediaAssetDims(media: MediaReference): { width?: number; height?: number } {
  if (!media || typeof media === 'string' || typeof media === 'number') return {}
  const w = Number((media as MediaAsset).width)
  const h = Number((media as MediaAsset).height)
  return {
    width: Number.isFinite(w) && w > 0 ? w : undefined,
    height: Number.isFinite(h) && h > 0 ? h : undefined,
  }
}
